if Rails.env.development?
  Rails.application.config.middleware.insert_before(
    ActionDispatch::Static,
    Rack::LiveReload
  )
end

