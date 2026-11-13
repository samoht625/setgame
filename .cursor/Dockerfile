# Base image for Cursor Cloud Agents: Ruby 3.2 (see .ruby-version), Node 22, Yarn and native gem build deps.
# Paths in environment.json are relative to .cursor/; do not COPY the project (Cursor checks out the repo).
#
# Both stages come from ECR Public's mirror of the Docker official images, and nothing here runs
# apt or curl, so the image builds when the network allows public.ecr.aws and little else.

FROM public.ecr.aws/docker/library/node:22-bookworm-slim AS node

# Debian bookworm with gcc, make, git, curl and the -dev headers native gems compile against.
FROM public.ecr.aws/docker/library/ruby:3.2.3-bookworm

COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/lib/node_modules /usr/local/lib/node_modules
COPY --from=node /opt /opt
RUN ln -s ../lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
    && ln -s ../lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx \
    && ln -s /opt/yarn-v*/bin/yarn /usr/local/bin/yarn

WORKDIR /workspace
