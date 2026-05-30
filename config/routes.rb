Rails.application.routes.draw do
  # Define your application routes per the DSL in https://guides.rubyonrails.org/routing.html

  # Reveal health status on /up that returns 200 if the app boots with no exceptions, otherwise 500.
  # Can be used by load balancers and uptime monitors to verify that the app is live.
  get "up" => "rails/health#show", as: :rails_health_check

  # Render dynamic PWA files from app/views/pwa/* (remember to link manifest in application.html.erb)
  # get "manifest" => "rails/pwa#manifest", as: :pwa_manifest
  # get "service-worker" => "rails/pwa#service_worker", as: :pwa_service_worker

  # ActionCable WebSocket endpoint
  mount ActionCable.server => '/cable'

  # Multiplayer game ("m" for "meet me at the table")
  get '/m' => 'home#multiplayer', as: :multiplayer

  # Tiny JSON endpoint: who is at the multiplayer table right now
  get '/presence' => 'presence#show', defaults: { format: :json }

  # Legacy solo path — solo now lives at the root
  get '/s' => redirect('/')

  # Shortcut icon route (common favicon shortcut)
  get '/favicon.ico' => redirect('/icon.png')

  # Solo is the default experience at the root path
  root "home#solo"
end
