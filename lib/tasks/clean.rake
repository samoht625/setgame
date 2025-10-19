namespace :clean do
  desc "Remove all build artifacts and temporary files"
  task all: :environment do
    puts "Cleaning build artifacts..."
    
    # Remove compiled assets
    FileUtils.rm_rf(Dir.glob("app/assets/builds/*"))
    puts "  ✓ Removed app/assets/builds/"
    
    # Remove temporary files
    FileUtils.rm_rf(Dir.glob("tmp/cache/**/*"))
    FileUtils.rm_rf(Dir.glob("tmp/pids/*.pid"))
    FileUtils.rm(Dir.glob("tmp/restart.txt"))
    puts "  ✓ Removed tmp/cache/"
    
    # Remove log files
    FileUtils.rm(Dir.glob("log/*.log"))
    puts "  ✓ Removed log files"
    
    # Remove node_modules
    FileUtils.rm_rf("node_modules")
    puts "  ✓ Removed node_modules/"
    
    puts "\nClean complete! Build artifacts removed."
    puts "Run 'yarn install' to restore dependencies."
  end
end

