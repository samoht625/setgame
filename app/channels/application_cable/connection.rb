# frozen_string_literal: true

module ApplicationCable
  class Connection < ActionCable::Connection::Base
    identified_by :player_id
    attr_reader :id_source, :request_meta
    
    def connect
      # Log comprehensive connection information for debugging
      ip_address = request.remote_ip
      user_agent = request.user_agent
      referer = request.referer
      origin = request.origin
      host = request.host
      
      Rails.logger.info "[Connection] New WebSocket connection"
      Rails.logger.info "[Connection] IP: #{ip_address}"
      Rails.logger.info "[Connection] User-Agent: #{user_agent}"
      Rails.logger.info "[Connection] Referer: #{referer}"
      Rails.logger.info "[Connection] Origin: #{origin}"
      Rails.logger.info "[Connection] Host: #{host}"
      Rails.logger.info "[Connection] Request headers: #{request.headers.to_h.select { |k, v| k.start_with?('HTTP_') }.inspect}"
      
      # Store sanitized request metadata for channel to transmit to the client (no cookies or secrets)
      headers = request.headers
      @request_meta = {
        ip: ip_address,
        user_agent: user_agent,
        referer: referer,
        origin: origin,
        host: host,
        cf_connecting_ip: headers['HTTP_CF_CONNECTING_IP'],
        true_client_ip: headers['HTTP_TRUE_CLIENT_IP'],
        x_forwarded_for: headers['HTTP_X_FORWARDED_FOR'],
        threat_score: headers['HTTP_X_RENDER_THREAT_SCORE'],
        cf_country: headers['HTTP_CF_IPCOUNTRY'],
        cf_ray: headers['HTTP_CF_RAY'],
        x_forwarded_proto: headers['HTTP_X_FORWARDED_PROTO'],
        x_forwarded_port: headers['HTTP_X_FORWARDED_PORT'],
        x_render_as_num: headers['HTTP_X_RENDER_AS_NUM'],
        render_proxy_ttl: headers['HTTP_RENDER_PROXY_TTL'],
        sec_fetch_dest: headers['HTTP_SEC_FETCH_DEST'],
        sec_fetch_mode: headers['HTTP_SEC_FETCH_MODE'],
        sec_fetch_site: headers['HTTP_SEC_FETCH_SITE'],
        sec_fetch_user: headers['HTTP_SEC_FETCH_USER'],
        sec_ch_ua: headers['HTTP_SEC_CH_UA'],
        sec_ch_ua_mobile: headers['HTTP_SEC_CH_UA_MOBILE'],
        sec_ch_ua_platform: headers['HTTP_SEC_CH_UA_PLATFORM'],
        accept: headers['HTTP_ACCEPT'],
        accept_language: headers['HTTP_ACCEPT_LANGUAGE'],
        accept_encoding: headers['HTTP_ACCEPT_ENCODING'],
        priority: headers['HTTP_PRIORITY'],
        purpose: headers['HTTP_PURPOSE']
      }.compact
      
      # Try to get player_id from query params or signed cookie
      param_player_id = request.params['player_id']
      cookie_player_id = cookies.signed[:player_id]
      
      Rails.logger.info "[Connection] Param player_id: #{param_player_id}"
      Rails.logger.info "[Connection] Cookie player_id: #{cookie_player_id}"
      
      # Validate UUID format
      uuid_pattern = /\A[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\z/i
      
      if param_player_id && param_player_id.match?(uuid_pattern)
        # Prefer explicit param when valid
        self.player_id = param_player_id
        cookies.signed[:player_id] = { value: param_player_id, expires: 1.year.from_now }
        Rails.logger.info "[Connection] Using param player_id: #{self.player_id}"
        @id_source = 'param'
      elsif cookie_player_id && cookie_player_id.match?(uuid_pattern)
        # Fallback to previously issued signed cookie
        self.player_id = cookie_player_id
        cookies.signed[:player_id] = { value: cookie_player_id, expires: 1.year.from_now }
        Rails.logger.info "[Connection] Using cookie player_id: #{self.player_id}"
        @id_source = 'cookie'
      else
        # Generate new UUID if invalid or missing
        self.player_id = SecureRandom.uuid
        cookies.signed[:player_id] = { value: self.player_id, expires: 1.year.from_now }
        Rails.logger.info "[Connection] Generated new player_id: #{self.player_id}"
        @id_source = 'generated'
      end
      
      # Register this connection (tracks active connections)
      GAME_ENGINE.register_connection(self.player_id)
      Rails.logger.info "[Connection] Registered connection for player_id: #{self.player_id}"
    end
    
    def disconnect
      Rails.logger.info "[Connection] WebSocket disconnected for player_id: #{self.player_id}"
      # Unregister this connection (will remove player if last connection)
      GAME_ENGINE.unregister_connection(self.player_id)
    end
  end
end

