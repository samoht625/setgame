# Base image for Cursor Cloud Agents — Rails 8 + Node/Yarn + native gem build deps.
# Paths in environment.json are relative to .cursor/; do not COPY the project (Cursor checks out the repo).

FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl git gnupg \
    build-essential \
    ruby3.2 ruby3.2-dev ruby-bundler \
    libyaml-dev zlib1g-dev libssl-dev libffi-dev \
    && rm -rf /var/lib/apt/lists/*

# Node.js 22 + Yarn (matches cloud agent Node tooling)
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && npm install -g yarn \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace
