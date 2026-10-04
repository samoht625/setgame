require "test_helper"

class DatabaseLockingTest < ActiveSupport::TestCase
  # The scratch database below is separate; a wrapping test transaction would hold its lock.
  self.use_transactional_tests = false

  class Scratch < ActiveRecord::Base
    self.abstract_class = true
  end

  test "a write waiting for the lock lets the writer holding it finish" do
    Dir.mktmpdir do |dir|
      Scratch.establish_connection(ActiveRecord::Base.connection_db_config.configuration_hash.merge(database: File.join(dir, "locking.sqlite3")))
      Scratch.connection.execute("CREATE TABLE writes (id INTEGER PRIMARY KEY)")

      errors = Queue.new
      write = lambda do |hold_for|
        Scratch.connection_pool.with_connection do |connection|
          connection.transaction do
            connection.execute("INSERT INTO writes DEFAULT VALUES")
            sleep hold_for
          end
        end
      rescue => error
        errors << error
      end

      started = Process.clock_gettime(Process::CLOCK_MONOTONIC)
      holder = Thread.new { write.call(0.3) }
      sleep 0.05
      waiter = Thread.new { write.call(0) }
      [holder, waiter].each(&:join)
      elapsed = Process.clock_gettime(Process::CLOCK_MONOTONIC) - started

      assert errors.empty?, "both writes should succeed, got #{errors.size} error(s)"
      assert_equal 2, Scratch.connection.select_value("SELECT COUNT(*) FROM writes")
      assert_operator elapsed, :<, 2
    ensure
      Scratch.remove_connection
    end
  end
end
