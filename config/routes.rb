Rails.application.routes.draw do
  # Define your application routes per the DSL in https://guides.rubyonrails.org/routing.html

  # Reveal health status on /up that returns 200 if the app boots with no exceptions, otherwise 500.
  # Can be used by load balancers and uptime monitors to verify that the app is live.
  get "up" => "rails/health#show", as: :rails_health_check

  # ActionCable WebSocket endpoint
  mount ActionCable.server => '/cable'

  namespace :api do
    post "solo/games", to: "solo_games#create"
    post "solo/games/:id/progress", to: "solo_games#progress"
    post "solo/scores", to: "solo_scores#create"
    get "solo/leaderboard", to: "solo_scores#leaderboard"
    get "solo/personal_bests", to: "solo_scores#personal_bests"
    get "daily", to: "daily#show"
    post "daily/games", to: "daily#create"
    patch "daily/name", to: "daily#name"
    get "daily/compare", to: "daily#compare"
    get "puzzle", to: "puzzle#show"
    post "puzzle/games", to: "puzzle#create"
    post "puzzle/games/:id/progress", to: "puzzle#progress"
    post "puzzle/games/:id/finish", to: "puzzle#finish"
    patch "puzzle/name", to: "puzzle#name"
  end

  # Multiplayer game ("m" for "meet me at the table")
  get '/m' => 'home#multiplayer', as: :multiplayer

  # Anonymous stats over every found set
  get '/stats' => 'stats#show', as: :stats

  # Today's Daily Deal (also the home page). Shared result links point here.
  get '/daily' => 'home#daily', as: :daily

  # Today's classic Puzzle: 12 cards, find all 6 sets
  get '/puzzle' => 'home#puzzle', as: :puzzle

  # Timed solo games against the clock
  get '/practice' => 'home#solo', as: :practice

  # Link-preview image for a shared daily result (token from DailyShare)
  get '/og/daily/:token.png' => 'og_images#daily', as: :daily_og_image, format: false

  # Tiny JSON endpoint: who is at the multiplayer table right now
  get '/presence' => 'presence#show', defaults: { format: :json }

  # Legacy solo path: old links land on the front door
  get '/s' => redirect('/')
  get '/solo' => redirect('/practice')

  # Shortcut icon route (common favicon shortcut)
  get '/favicon.ico' => redirect('/icon-32.png')

  # The Daily Deal is the front door
  root "home#daily"
end
