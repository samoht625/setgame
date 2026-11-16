# frozen_string_literal: true

# /sitemap.xml, built from the archive (see Sitemap) instead of a file in
# public/, so each day's pages are listed from the moment they exist.
class SitemapController < ActionController::API
  def show
    expires_in Sitemap::MAX_AGE, public: true
    render xml: Sitemap.current
  end
end
