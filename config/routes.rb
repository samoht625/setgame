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
    get "archive", to: "archive#index", format: false
    get "archive/:kind/:number", to: "archive#show", format: false
    post "sign_in", to: "sign_in#create"
    delete "sign_in", to: "sign_in#destroy"
    patch "reminder", to: "reminders#update"
    patch "settings", to: "settings#update"
  end

  # The emailed sign-in link lands here; the page posts the token back (or asks first, in another browser).
  get '/signin' => 'sign_in#show', as: :sign_in
  post '/signin' => 'sign_in#create'

  # Reminder email links: Play opens the game (offering to sign in); one-click unsubscribe.
  get '/play' => 'reminders#play', as: :reminder_play
  post '/play' => 'reminders#sign_in_and_play'
  get '/reminders/unsubscribe' => 'reminders#confirm_unsubscribe', as: :reminder_unsubscribe
  post '/reminders/unsubscribe' => 'reminders#unsubscribe'
  post '/reminders/resubscribe' => 'reminders#resubscribe'

  # Multiplayer game ("m" for "meet me at the table")
  get '/m' => 'home#multiplayer', as: :multiplayer

  # Anonymous stats over every found set
  get '/stats' => 'stats#show', as: :stats

  # Today's Daily Deal. Its shared result links point here.
  get '/daily' => 'home#daily', as: :daily

  # Today's classic Puzzle: 12 cards, find all 6 sets. Also the home page,
  # which is the address search engines are given for it.
  get '/puzzle' => 'home#puzzle', as: :puzzle

  # Timed solo games against the clock
  get '/practice' => 'home#solo', as: :practice

  # The archive: a page per closed day, numbered like the share links
  # ("Set Puzzle #21" is /puzzle/21), and the index of them all.
  get '/archive' => 'archive#index', as: :archive, format: false
  get '/daily/:number' => 'archive#daily', as: :archived_daily, format: false
  get '/puzzle/:number' => 'archive#puzzle', as: :archived_puzzle, format: false

  # The blog: its posts, and each one at its slug
  get '/blog' => 'blog#index', as: :blog, format: false
  get '/blog/:slug' => 'blog#show', as: :blog_post, format: false

  # Every page, and every archived day as it closes
  get '/sitemap.xml' => 'sitemap#show', as: :sitemap, format: false

  # Link-preview image for a shared daily result (token from DailyShare)
  get '/og/daily/:token.png' => 'og_images#daily', as: :daily_og_image, format: false
  get '/og/puzzle/:token.png' => 'og_images#puzzle', as: :puzzle_og_image, format: false

  # Tiny JSON endpoint: who is at the multiplayer table right now
  get '/presence' => 'presence#show', defaults: { format: :json }

  # Legacy solo path: old links land on the front door
  get '/s' => redirect('/')
  get '/solo' => redirect('/practice')

  # Shortcut icon route (common favicon shortcut)
  get '/favicon.ico' => redirect('/icon-32.png')

  # The Puzzle is the front door
  root "home#puzzle"
end
