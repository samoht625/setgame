#!/usr/bin/env ruby
# frozen_string_literal: true

require 'json'
require 'minitest/autorun'
require 'open3'
require 'rbconfig'
require 'sqlite3'
require 'tmpdir'

class GamePersistenceBootTest < Minitest::Test
  ROOT = File.expand_path('..', __dir__)

  def setup
    @directory = Dir.mktmpdir('setgame-persistence-')
    @database_path = File.join(@directory, 'test.sqlite3')
    with_database do |database|
      database.execute_batch(<<~SQL)
        CREATE TABLE game_snapshots (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name VARCHAR NOT NULL DEFAULT 'default',
          version INTEGER NOT NULL DEFAULT 1,
          payload TEXT NOT NULL,
          created_at DATETIME NOT NULL,
          updated_at DATETIME NOT NULL
        );
        CREATE UNIQUE INDEX index_game_snapshots_on_name ON game_snapshots (name);
      SQL
    end
  end

  def teardown
    FileUtils.remove_entry(@directory)
  end

  def test_cold_boot_restores_existing_state_after_autoloaders_are_ready
    seed(fixture)
    result = boot
    assert_equal fixture, result.fetch('snapshot')
    assert_equal fixture, stored_payload
    assert_equal 1, result.fetch('snapshot_count')
  end

  def test_cold_boot_recovers_mid_reveal_and_a_second_process_does_not_replay_it
    seed(pending_fixture)
    recovered = boot
    expected = pending_fixture.merge(
      'board' => [13, 14, 15] + (4..12).to_a,
      'deck' => (16..81).to_a,
      'active_claim' => nil
    )

    assert_equal expected, recovered.fetch('snapshot')
    assert_equal expected, stored_payload
    assert_equal expected, boot.fetch('snapshot')
  end

  def test_cold_boot_recovers_final_set_without_losing_the_winner
    seed(pending_fixture.merge('board' => [1, 2, 3], 'deck' => []))
    recovered = boot
    snapshot = recovered.fetch('snapshot')

    assert_empty snapshot.fetch('board')
    assert_empty snapshot.fetch('deck')
    assert_nil snapshot.fetch('active_claim')
    assert_equal 'round_over', snapshot.fetch('status')
    assert_equal 3, snapshot.fetch('scores').fetch('player-one')
    assert_equal snapshot, stored_payload
    assert_equal 10, recovered.fetch('state').fetch('countdown')
    assert_equal 'player-one', recovered.fetch('state').fetch('placements').first.fetch('player_id')
    assert_equal snapshot, boot.fetch('snapshot')
  end

  def test_missing_snapshot_starts_and_saves_a_fresh_round
    result = boot
    snapshot = result.fetch('snapshot')
    assert_equal 'playing', snapshot.fetch('status')
    assert_empty snapshot.fetch('scores')
    assert_equal (1..81).to_a, (snapshot.fetch('board') + snapshot.fetch('deck')).sort
    assert_equal snapshot, stored_payload
    assert_equal 1, result.fetch('snapshot_count')
  end

  def test_read_error_never_overwrites_the_existing_snapshot
    seed(fixture)
    before = stored_row
    result = boot(
      before_boot: <<~RUBY,
        require File.join(#{ROOT.inspect}, 'app/services/game_state_store')
        def GameStateStore.load
          raise IOError, 'simulated read failure'
        end
      RUBY
      after_boot: "GAME_ENGINE.update_name('player-one', 'Temporary'); GAME_ENGINE.start_new_round"
    )

    assert_equal 'Temporary', result.fetch('snapshot').fetch('names').fetch('player-one')
    assert_equal before, stored_row
    assert_equal fixture, boot.fetch('snapshot')
  end

  def test_unsupported_version_is_not_treated_as_an_empty_store
    seed(fixture, version: 999)
    before = stored_row
    boot(after_boot: "GAME_ENGINE.update_name('player-one', 'Temporary'); GAME_ENGINE.start_new_round")
    assert_equal before, stored_row
  end

  def test_unreadable_payload_is_not_treated_as_an_empty_store
    ['not json', '[]'].each do |payload|
      seed(payload)
      before = stored_row
      boot(after_boot: "GAME_ENGINE.update_name('player-one', 'Temporary'); GAME_ENGINE.start_new_round")
      assert_equal before, stored_row
    end
  end

  def test_store_query_error_propagates_instead_of_looking_like_no_snapshot
    seed(fixture)
    result = boot(after_boot: <<~RUBY)
      class << GameSnapshot
        def default
          raise IOError, 'simulated query failure'
        end
      end
      begin
        GameStateStore.load
        raise 'Expected load to raise'
      rescue IOError => error
        raise unless error.message == 'simulated query failure'
      end
    RUBY
    assert_equal fixture, result.fetch('snapshot')
    assert_equal fixture, stored_payload
  end

  private

  def boot(before_boot: '', after_boot: '')
    code = <<~RUBY
      require 'json'
      require 'timeout'
      #{before_boot}
      require File.join(#{ROOT.inspect}, 'config/environment')
      actual_database = ActiveRecord::Base.connection_db_config.database
      raise "Unexpected database: \#{actual_database}" unless actual_database == #{@database_path.inspect}
      GAME_ENGINE.broadcaster = nil
      #{after_boot}
      Timeout.timeout(5) { GAME_ENGINE.flush_snapshots }
      puts "PERSISTENCE_RESULT=" + JSON.generate(
        snapshot: GAME_ENGINE.snapshot_payload,
        state: GAME_ENGINE.current_state,
        snapshot_count: GameSnapshot.count
      )
    RUBY
    env = {
      'RAILS_ENV' => 'test',
      'DATABASE_URL' => "sqlite3:#{@database_path}",
      'BUNDLE_IGNORE_CONFIG' => '1'
    }
    output, errors, status = Open3.capture3(env, RbConfig.ruby, '-e', code, chdir: ROOT)
    assert status.success?, "Cold boot failed (#{status.exitstatus}):\n#{output}\n#{errors}"
    refute_match(/terminated with exception/, errors)
    line = output.lines.find { |entry| entry.start_with?('PERSISTENCE_RESULT=') }
    refute_nil line, "Cold boot returned no snapshot:\n#{output}\n#{errors}"
    JSON.parse(line.delete_prefix('PERSISTENCE_RESULT='))
  end

  def seed(payload, version: 1)
    payload = JSON.generate(payload) unless payload.is_a?(String)
    with_database do |database|
      database.execute('DELETE FROM game_snapshots')
      database.execute(
        'INSERT INTO game_snapshots (name, version, payload, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
        ['default', version, payload, '2026-01-01 00:00:00', '2026-01-01 00:00:00']
      )
    end
  end

  def stored_row
    with_database { |database| database.get_first_row('SELECT * FROM game_snapshots WHERE name = ?', ['default']) }
  end

  def stored_payload
    JSON.parse(with_database { |database| database.get_first_value('SELECT payload FROM game_snapshots WHERE name = ?', ['default']) })
  end

  def with_database
    database = SQLite3::Database.new(@database_path)
    yield database
  ensure
    database&.close
  end

  def fixture
    {
      'board' => (1..12).to_a,
      'deck' => (13..81).to_a,
      'scores' => { 'player-one' => 2 },
      'names' => { 'player-one' => 'Original' },
      'status' => 'playing',
      'recent_claims' => [],
      'active_claim' => nil
    }
  end

  def pending_fixture
    claim = { 'player_id' => 'player-one', 'cards' => [1, 2, 3] }
    fixture.merge('scores' => { 'player-one' => 3 }, 'recent_claims' => [claim], 'active_claim' => claim)
  end
end
