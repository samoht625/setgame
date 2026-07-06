Rails.application.routes.draw do
  # Define your application routes per the DSL in https://guides.rubyonrails.org/routing.html

  # Reveal health status on /up that returns 200 if the app boots with no exceptions, otherwise 500.
  # Can be used by load balancers and uptime monitors to verify that the app is live.
  get "up" => "rails/health#show", as: :rails_health_check

  # ActionCable WebSocket endpoint
  mount ActionCable.server => '/cable'

  namespace :api do
    post "solo/games", to: "solo_games#create"
    post "solo/scores", to: "solo_scores#create"
    get "solo/leaderboard", to: "solo_scores#leaderboard"
    get "solo/personal_bests", to: "solo_scores#personal_bests"
  end

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
