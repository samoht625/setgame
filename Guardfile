guard 'livereload', host: 'localhost', port: '35729', apply_css_live: true do
  # Views (erb/haml/slim)
  watch(%r{app/views/.+\.(erb|haml|slim)$})

  # Compiled assets from esbuild/tailwind
  watch(%r{app/assets/builds/.+\.(css|js|map)$})

  # Public assets and translations
  watch(%r{public/.+\.(css|js|png|jpg|jpeg|svg|webp)$})
  watch(%r{config/locales/.+\.yml$})

  # Ruby app/config changes
  watch(%r{app/(controllers|helpers|models|services)/.+\.rb$})
  watch(%r{config/.+\.rb$})
end

