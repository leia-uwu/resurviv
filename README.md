# Open sourced surviv.io
Resurviv.io is an open source recreation of a hit web game "surviv.io" that has been permanently shut down.

Our goal is to immortalize it by getting the recreation as close as possible to the last canonical version of the game.

We do not consider any updates after the Kongregate acquisition canonical, so those will not be a part of the project.

### This is work in progress and not fully ready for production.

### [TODO LIST AND PROGRESS](./TODO.md)

## Running locally

start client development server with `pnpm dev:client`

and server with `pnpm dev:server`

or cd into server and client directories and run `pnpm dev` for each

## Production builds
Build client and server with `pnpm -r build`

Start the server with `pnpm start` on the server directory

you can use `pnpm preview` on the client to use vite preview server, but [nginx](https://nginx.org) is more recommended for that
