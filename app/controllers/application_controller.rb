class ApplicationController < ActionController::Base
  # Tailwind CSS v4's floor (cascade layers, @property, color-mix). Older browsers
  # can't render the board. Browsers not listed here, and crawlers, are allowed.
  allow_browser versions: { safari: 16.4, chrome: 111, firefox: 128, opera: 97, ie: false }
end
