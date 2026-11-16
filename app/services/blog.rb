# frozen_string_literal: true

# The blog's posts, newest first. A post is a class with a TITLE, SLUG,
# DESCRIPTION and PUBLISHED_ON, and a view named after it in views/blog.
module Blog
  POSTS = [SpottingSets].freeze

  def self.find(slug)
    POSTS.find { |post| post::SLUG == slug }
  end

  def self.path(post)
    "/blog/#{post::SLUG}"
  end
end
