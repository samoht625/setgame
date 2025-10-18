# This file is used by Rack-based servers to start the application.

require_relative "config/environment"

run Rails.application
Rails.application.load_server

# Mount ActionCable
Rails.application.config.action_cable.mount_path = '/cable'
