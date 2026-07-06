# frozen_string_literal: true

class GameSnapshot < ApplicationRecord
  CURRENT_VERSION = 1

  validates :name, presence: true, uniqueness: true
  validates :version, presence: true
  validates :payload, presence: true

  def self.default
    find_by(name: "default")
  end

  def parsed_payload
    JSON.parse(payload)
  rescue JSON::ParserError
    nil
  end
end
