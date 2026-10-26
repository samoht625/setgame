# frozen_string_literal: true

# Which player a request plays as.
#
# A signed-in browser always plays as its account's player. Otherwise the id
# the browser sends is used only when the browser proves it owns that id: it
# matches the signed cookie, comes with its PlayerKey, or has never been used
# (a brand-new player). Anything else falls back to the cookie's player, or a
# new one. An account's player is never reachable without a session.
module PlayerResolver
  UUID_PATTERN = /\A[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\z/i

  def self.uuid?(value)
    value.is_a?(String) && value.match?(UUID_PATTERN)
  end

  def self.resolve(claimed:, cookie:, key: nil, freshly_minted: false, account: nil)
    return account.player_id if account

    claimed = claimed.to_s
    cookie = cookie.to_s
    candidate =
      if uuid?(claimed) && !(freshly_minted && uuid?(cookie) && cookie != claimed) && owns?(claimed, cookie: cookie, key: key)
        claimed
      elsif uuid?(cookie)
        cookie
      end
    candidate && !Account.owns_player?(candidate) ? candidate : SecureRandom.uuid
  end

  def self.owns?(claimed, cookie:, key:)
    claimed == cookie || PlayerKey.valid?(claimed, key) || !PlayerIdentity.history?(claimed)
  end
end
