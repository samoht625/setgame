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
  end

  def show
    @post = Blog.find(params[:slug])
    return render(file: Rails.public_path.join("404.html"), status: :not_found, layout: false) unless @post

    render @post.name.underscore
  end
end
