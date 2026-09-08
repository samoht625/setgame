#!/usr/bin/env ruby
# frozen_string_literal: true

require 'json'
require 'minitest/autorun'
require 'stringio'
require 'timeout'
require_relative '../app/services/rules'
require_relative '../app/services/game_engine'

class GamePersistenceTest < Minitest::Test
  class MemoryStore
    attr_reader :snapshots

    def initialize(&before_save)
      @snapshots = []
      @before_save = before_save
    end

    def save(payload)
      @before_save&.call(payload)
      @snapshots << JSON.parse(JSON.generate(payload))
    end
  end

  # Advance timers explicitly; persistence still runs on the real writer thread.
  class ControlledEngine < GameEngine
    attr_reader :claim_token, :countdown_starts

    def initialize(**options)
      @now = 0
      @countdown_starts = 0
      super(auto_start: false, start_presence_sweeper: false, **options)
    end

    def resolve_claim(token = @claim_token)
      resolve_pending_claim(token)
    end

    def expire_reset
      @now += @reset_seconds
      @mutex.synchronize do
        advance_reset_locked! if @reset_request_token && @reset_request_token == @scheduled_reset_token
      end
    end

    private

    def schedule_claim_resolution(token)
      @claim_token = token
    end

    def schedule_reset(token)
      @scheduled_reset_token = token
    end

    def start_round_countdown
      @countdown_starts += 1
    end

    def monotonic_time
      @now
    end

    def enqueue_snapshot_locked!
      raise 'Snapshot captured outside game mutex' unless @mutex.owned?

      super
    end
  end

  def setup
    @store = MemoryStore.new
    @engine = build_engine(@store)
    @engine.restore_from!(fixture)
  end

  def test_mid_reveal_restore_consumes_cards_without_awarding_another_point
    assert @engine.claim_set('player-one', [1, 2, 3])[:success]
    pending = saved_snapshot(@engine, @store)
    assert_equal [1, 2, 3], pending.fetch('active_claim').fetch('cards')
    assert_equal 3, pending.fetch('scores').fetch('player-one')

    restored_store = MemoryStore.new
    restored = build_engine(restored_store)
    restored.restore_from!(pending)
    resolved = saved_snapshot(restored, restored_store)

    assert_equal [13, 14, 15] + (4..12).to_a, resolved.fetch('board')
    assert_equal (16..81).to_a, resolved.fetch('deck')
    assert_equal pending.fetch('scores'), resolved.fetch('scores')
    assert_equal pending.fetch('recent_claims'), resolved.fetch('recent_claims')
    assert_nil resolved.fetch('active_claim')
    refute restored.claim_set('player-two', [1, 2, 3])[:success]

    @engine.resolve_claim
    @engine.resolve_claim
    assert_equal resolved, saved_snapshot(@engine, @store)

    restored.restore_from!(pending)
    assert_equal resolved, saved_snapshot(restored, restored_store)
    rebooted = build_engine
    rebooted.restore_from!(resolved)
    assert_equal resolved, rebooted.snapshot_payload
  end

  def test_mid_reveal_restore_collapses_extra_rows_without_drawing_again
    @engine.restore_from!(fixture.merge('board' => (1..15).to_a, 'deck' => (16..81).to_a))
    assert @engine.claim_set('player-one', [1, 2, 3])[:success]
    pending = saved_snapshot(@engine, @store)

    restored = build_engine(@store)
    restored.restore_from!(pending)
    resolved = saved_snapshot(restored, @store)

    assert_equal [13, 14, 15] + (4..12).to_a, resolved.fetch('board')
    assert_equal pending.fetch('deck'), resolved.fetch('deck')
    assert_equal (4..81).to_a, (resolved.fetch('board') + resolved.fetch('deck')).sort
    assert_equal 3, resolved.fetch('scores').fetch('player-one')
  end

  def test_final_set_recovery_preserves_results_and_resumes_round_countdown
    @engine.restore_from!(fixture.merge('board' => [1, 2, 3], 'deck' => []))
    assert @engine.claim_set('player-one', [1, 2, 3])[:success]
    pending = saved_snapshot(@engine, @store)
    assert_equal 'playing', pending.fetch('status')

    restored = build_engine(@store)
    restored.restore_from!(pending)
    finished = saved_snapshot(restored, @store)
    state = restored.current_state

    assert_empty finished.fetch('board')
    assert_empty finished.fetch('deck')
    assert_nil finished.fetch('active_claim')
    assert_equal 'round_over', finished.fetch('status')
    assert_equal 3, finished.fetch('scores').fetch('player-one')
    assert_equal 10, state.fetch(:countdown)
    assert_equal [{ player_id: 'player-one', name: 'Original', score: 3, place: 1 }], state.fetch(:placements)
    assert_equal 1, restored.countdown_starts
    refute restored.claim_set('player-one', [1, 2, 3])[:success]

    rebooted = build_engine
    rebooted.restore_from!(finished)
    assert_equal finished, rebooted.snapshot_payload
    assert_equal state.fetch(:placements), rebooted.current_state.fetch(:placements)
    assert_equal 1, rebooted.countdown_starts

    @engine.resolve_claim
    assert_equal finished, saved_snapshot(@engine, @store)
  end

  def test_legacy_playing_snapshot_without_active_claim_still_restores
    assert_equal fixture.merge('active_claim' => nil), @engine.snapshot_payload
    assert_empty @store.snapshots
  end

  def test_successful_name_change_is_saved_but_rejected_name_is_not
    assert @engine.update_name('player-one', '  New Name  ')[:success]
    saved = saved_snapshot(@engine, @store)
    assert_equal 'New Name', saved.fetch('names').fetch('player-one')
    assert_equal @engine.snapshot_payload, saved

    refute @engine.update_name('player-one', '')[:success]
    refute @engine.update_name('player-one', '<invalid>')[:success]
    @engine.flush_snapshots
    assert_equal 1, @store.snapshots.length
  end

  def test_scheduled_reset_is_saved_and_stale_claim_cannot_replace_its_cards
    assert @engine.claim_set('player-one', [1, 2, 3])[:success]
    saved_snapshot(@engine, @store)
    assert @engine.request_reset('player-one')[:success]
    assert @engine.expire_reset
    reset = saved_snapshot(@engine, @store)

    assert_empty reset.fetch('scores')
    assert_empty reset.fetch('recent_claims')
    assert_nil reset.fetch('active_claim')
    assert_equal fixture.fetch('names'), reset.fetch('names')
    assert_equal 'playing', reset.fetch('status')
    assert_equal (1..81).to_a, (reset.fetch('board') + reset.fetch('deck')).sort
    assert_equal @engine.snapshot_payload, reset
    assert_equal 0, @engine.current_state.fetch(:reset_countdown)

    @engine.resolve_claim
    @engine.flush_snapshots
    assert_equal reset, @engine.snapshot_payload
    assert_equal 2, @store.snapshots.length

    restored = build_engine
    restored.restore_from!(reset)
    assert_equal reset, restored.snapshot_payload
  end

  def test_cancelled_reset_does_not_save_a_new_round
    @engine.update_name('player-one', 'Before Reset')
    original = saved_snapshot(@engine, @store)
    assert @engine.request_reset('player-one')[:success]
    assert @engine.cancel_reset('player-two')[:success]
    refute @engine.expire_reset
    assert_equal original, saved_snapshot(@engine, @store)
    assert_equal 1, @store.snapshots.length
  end

  def test_new_round_is_saved_including_automatic_start
    engine = GameEngine.new(snapshot_store: @store, start_presence_sweeper: false)
    first = saved_snapshot(engine, @store)
    assert_equal engine.snapshot_payload, first
    assert_equal (1..81).to_a, (first.fetch('board') + first.fetch('deck')).sort

    engine.start_new_round
    assert_equal engine.snapshot_payload, saved_snapshot(engine, @store)
    assert_equal 2, @store.snapshots.length
  end

  def test_slow_write_is_ordered_and_waiting_snapshots_are_coalesced_without_blocking_game
    entered = Queue.new
    release = Queue.new
    writers = []
    store = MemoryStore.new do |payload|
      writers << Thread.current
      if payload.fetch('names').fetch('player-one') == 'First'
        entered << payload
        release.pop
      end
    end
    engine = build_engine(store)
    engine.restore_from!(fixture)
    assert engine.update_name('player-one', 'First')[:success]
    first = Timeout.timeout(2) { entered.pop }

    Timeout.timeout(2) do
      100.times { |index| engine.update_name('player-one', "Name #{index}") }
      assert engine.claim_set('player-one', [1, 2, 3])[:success]
      engine.resolve_claim
      assert engine.request_reset('player-one')[:success]
      assert engine.expire_reset
      engine.update_name('player-one', 'Latest')
    end
    latest = engine.snapshot_payload
    assert_equal 'First', first.fetch('names').fetch('player-one')
    assert_equal fixture.fetch('scores'), first.fetch('scores')
    assert_equal 1, writers.length

    release << true
    Timeout.timeout(2) { engine.flush_snapshots }
    assert_equal [first, latest], store.snapshots
    assert_equal 1, writers.uniq.length
  ensure
    release << true if release
    engine&.flush_snapshots
  end

  def test_writer_reports_failure_and_can_save_a_later_mutation
    log = StringIO.new
    attempts = 0
    store = MemoryStore.new do
      attempts += 1
      raise IOError, 'disk unavailable' if attempts == 1
    end
    engine = build_engine(store, logger: Logger.new(log))
    engine.restore_from!(fixture)
    assert engine.update_name('player-one', 'First')[:success]
    assert_raises(IOError) { engine.flush_snapshots }
    assert_match(/disk unavailable/, log.string)

    assert engine.update_name('player-one', 'Recovered')[:success]
    assert_equal engine.snapshot_payload, saved_snapshot(engine, store)
    assert_equal 1, store.snapshots.length
  end

  private

  def fixture
    {
      'board' => (1..12).to_a,
      'deck' => (13..81).to_a,
      'scores' => { 'player-one' => 2 },
      'names' => { 'player-one' => 'Original' },
      'status' => 'playing',
      'recent_claims' => []
    }
  end

  def build_engine(store = nil, **options)
    ControlledEngine.new(snapshot_store: store, **options)
  end

  def saved_snapshot(engine, store)
    Timeout.timeout(2) { engine.flush_snapshots }
    store.snapshots.last
  end
end
