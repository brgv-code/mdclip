# Homebrew formula. Lives in the tap repo github.com/brgv-code/homebrew-tap as Formula/mdclip.rb
# After each `npm publish`, update `url` and `sha256`:
#   curl -sL https://registry.npmjs.org/mdclip/-/mdclip-<version>.tgz | shasum -a 256
class Mdclip < Formula
  desc "Copy markdown as rich text, and rich text as markdown"
  homepage "https://github.com/brgv-code/mdclip"
  url "https://registry.npmjs.org/mdclip/-/mdclip-0.2.0.tgz"
  sha256 "REPLACE_AFTER_FIRST_NPM_PUBLISH"
  license "MIT"

  depends_on "node"

  def install
    system "npm", "install", *std_npm_args
    bin.install_symlink Dir["#{libexec}/bin/*"]
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/mdclip --version")
    assert_match "<h1>hi</h1>", pipe_output("#{bin}/mdclip -o", "# hi")
  end
end
