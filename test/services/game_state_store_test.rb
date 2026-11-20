# frozen_string_literal: true

require "test_helper"
require "minitest/mock"
require "timeout"

class GameStateStoreTest < ActiveSupport::TestCase
  # GameEngine persists snapshots on a background thread; a wrapping test
  # transaction would hold SQLite's write lock across threads.
  self.use_transactional_tests = false

  class NoCountdownEngine < GameEngine
    private

    def start_round_countdown
      # Skip 10s background sleep thread in unit tests.
    end
  end

  setup { GameSnapshot.delete_all }
  teardown { GameSnapshot.delete_all }

  test "boot restores an existing snapshot without altering it" do
    seed(fixture)

    engine = boot_engine
    assert_equal fixture, engine.snapshot_payload
    assert_equal fixture, stored_payload
    assert_equal 1, GameSnapshot.count
  end

  test "boot recovers a mid-reveal snapshot and a second boot does not replay it" do
    seed(pending_fixture)

    first = boot_engine
    expected = pending_fixture.merge(
      "board" => [13, 14, 15] + (4..12).to_a,
      "deck" => (16..81).to_a,
      "active_claim" => nil
    )
    assert_equal expected, first.snapshot_payload
    assert_equal expected, stored_payload

    second = boot_engine
    assert_equal expected, second.snapshot_payload
  end

  test "boot recovers a final-set mid-reveal snapshot without losing the winner" do
    seed(pending_fixture.merge("board" => [1, 2, 3], "deck" => []))

    recovered = boot_engine
    snapshot = recovered.snapshot_payload
    state = recovered.current_state

    assert_empty snapshot.fetch("board")
    assert_empty snapshot.fetch("deck")
    assert_nil snapshot.fetch("active_claim")
    assert_equal "round_over", snapshot.fetch("status")
    assert_equal 3, snapshot.fetch("scores").fetch("player-one")
    assert_equal snapshot, stored_payload
    assert_equal 10, state.fetch(:countdown)
    assert_equal "player-one", state.fetch(:placements).first.fetch(:player_id)
    assert_equal snapshot, boot_engine.snapshot_payload
  end

  test "missing snapshot starts and persists a fresh round" do
    engine = boot_engine
    snapshot = engine.snapshot_payload
    assert_equal "playing", snapshot.fetch("status")
    assert_empty snapshot.fetch("scores")
    assert_equal (1..81).to_a, (snapshot.fetch("board") + snapshot.fetch("deck")).sort
    assert_equal snapshot, stored_payload
    assert_equal 1, GameSnapshot.count
  end

  test "unsupported version and unreadable payloads raise LoadError and are never overwritten on boot" do
    seed(fixture, version: 999)
    before_version = GameSnapshot.default.attributes
    assert_raises(GameStateStore::LoadError) { GameStateStore.load }
    boot_engine { |engine| engine.update_name("player-one", "Temporary"); engine.start_new_round }
    assert_equal before_version, GameSnapshot.default.attributes

    ["not json", "[]"].each do |bad_payload|
      seed(bad_payload)
      before = GameSnapshot.default.attributes
      assert_raises(GameStateStore::LoadError) { GameStateStore.load }
      boot_engine { |engine| engine.update_name("player-one", "Temporary"); engine.start_new_round }
      assert_equal before, GameSnapshot.default.attributes
    end
  end

  test "store query errors propagate and disable persistence rather than overwriting existing state" do
    seed(fixture)
    before = GameSnapshot.default.attributes

    GameSnapshot.stub(:default, -> { raise IOError, "simulated query failure" }) do
      assert_raises(IOError) { GameStateStore.load }
      boot_engine { |engine| engine.update_name("player-one", "Temporary"); engine.start_new_round }
    end

    assert_equal before, GameSnapshot.default.attributes
    assert_equal fixture, boot_engine.snapshot_payload
  end

  private

  # Mirrors config/initializers/game_engine.rb boot sequence.
  def boot_engine
    snapshot_store = GameStateStore
    payload = nil
    begin
      payload, _version = snapshot_store.load
    rescue StandardError
      snapshot_store = nil
    end

    engine = NoCountdownEngine.new(auto_start: false, start_presence_sweeper: false, snapshot_store: snapshot_store, logger: Logger.new(nil))
    if payload
      engine.restore_from!(payload)
    else
      engine.start_new_round
    end
    yield engine if block_given?
    Timeout.timeout(5) { engine.flush_snapshots }
    engine
  end

  def seed(payload, version: GameSnapshot::CURRENT_VERSION)
    GameSnapshot.delete_all
    GameSnapshot.create!(
      name: GameStateStore::NAME,
      version: version,
      payload: payload.is_a?(String) ? payload : JSON.generate(payload)
    )
  end

  def stored_payload
    JSON.parse(GameSnapshot.default.payload)
  end

  def fixture
    {
      "board" => (1..12).to_a,
      "deck" => (13..81).to_a,
      "scores" => { "player-one" => 2 },
      "names" => { "player-one" => "Original" },
      "status" => "playing",
      "recent_claims" => [],
      "active_claim" => nil
    }
  end

  def pending_fixture
    claim = { "player_id" => "player-one", "cards" => [1, 2, 3] }
    fixture.merge("scores" => { "player-one" => 3 }, "recent_claims" => [claim], "active_claim" => claim)
  end
end
