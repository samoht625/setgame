# frozen_string_literal: true

# The blog: a list of posts (/blog) and each post at its slug. Pages are the
# same for everyone and readable without JavaScript. They use the stats
# layout because a post can show the charts from /stats, which it styles.
class BlogController < ApplicationController
  include CurrentAccount
  include KnownPlayer

  layout "stats"
  before_action :load_known_player

  def index
    @posts = Blog::POSTS
    fresh_when etag: [blog_etag_key, @posts.map { |post| [post::SLUG, post::PUBLISHED_ON] }]
  end

  def show
    @post = Blog.find(params[:slug])
    return render(file: Rails.public_path.join("404.html"), status: :not_found, layout: false) unless @post

    template = @post.name.underscore
    post_etag = if @post == SpottingSets
      current = SpottingSets.current
      [@post::SLUG, @post::PUBLISHED_ON, current.taken_at, current.finds]
    else
      [@post::SLUG, @post::PUBLISHED_ON]
    end
    render template if stale?(etag: [blog_etag_key, post_etag], template: "blog/#{template}")
  end

  private

  def blog_etag_key
    [@known_player_id, @known_player_new, @known_player_name, @account_email, @reminder, @sign_in_enabled, @two_card_choice]
  end
end
