# Hosting your own Resurviv server
Looking to host your own Resurviv server to mess around or play against friends? This is the place for you.

## Prerequisites
Before diving into the setup instructions, make sure you have the correct tools for the job. Hosting a dedicated Resurviv server requires two things:
 * SSH access to a VPS (or some other form of dedicated hosting)
 * The ability to open ports on said machine

You can find cheap VPS hosts at [Ionos](https://www.ionos.com/), [A2 Hosting](https://www.a2hosting.com), or [Vultr](https://www.vultr.com/).

**NOTE:** I am not endorsing or recommending any of the following hosts, they are just a few I have found people to use.

If you accept the risk, you can host a dedicated server on your home network. However, you will need to [port forward](https://en.wikipedia.org/wiki/Port_forwarding) the necessary ports via your router for others to access your server. Do not do this unless you understand what you are doing. Previous Linux knowledge required.

## Setup
This tutorial is written assuming you are using [Ubuntu 20.04](https://ubuntu.com/). Follow accordingly based on the distribution you are using.

### Logging into the machine 
If you bought a VPS (or other form of hosting) from a hosting company, then these credentials should be accessible via their dashboard. Typically, they will consist of three things:
 * **IP:** The IP of your server.
 * **Username** The username (usually root), to log in with.
 * **Password:** The password to log in with.

Optionally, if your VPS provides SSH access on a different port, that will also be listed.

Open a terminal (Command Prompt for Windows) and write the following command:
```sh
ssh username@host
```
replacing username and host with your username and host.

If you have a custom SSH port (not 22), then use this instead:
```sh
ssh username@host -p port
```
additionally replacing port with the custom SSH port provided.

After writing this command, hit enter. You will be prompted for a password.

For security reasons, you cannot view your password as you type it. Type in the password, and hit enter.

If you see a notice notifying you of the machine you have just logged into, congratulations! You have succesfully SSH'd into your server.

### Dependencies
[Resurviv](https://github.com/leia-uwu/resurviv.git) requires a few dependencies:
 * [Git](https://git-scm.com)
 * [NGINX](https://nginx.org)
 * [Node.js](https://nodejs.org)
 * [pnpm](https://pnpm.io)

If you are logged in as root, start by making sure sudo is installed:
```sh
apt -y install sudo
```

Then install git and nginx with the following command.
```sh
sudo apt -y install git nginx
```

To install Node.js, install the appropriate package from your distro, or for Ubuntu:
```sh
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - &&\
sudo apt-get install -y nodejs
```

And finally, install pnpm:
```sh
npm i -g pnpm
```

### Building source
Next, move into `/opt`, clone the repository and traverse into it:
```sh
cd /opt
git clone https://github.com/leia-uwu/resurviv.git
cd resurviv
```

Install the necessary dependencies:
```sh
pnpm install
```

Update the server config file's:
```sh
nano server/src/config.ts
```
```ts
export const Config = {
    host: "0.0.0.0",
    port: 8000,
    // ...
```

changing `host` to `0.0.0.0`.

Navigate to line 673 on the main.ts file
```sh
nano +673 server/src/main.ts
```
```ts
urls.push(
                `ws${matchData.useHttps ? "s" : ""}://YOURIPADDRESS/play?gameId=${
                    matchData.gameId
                }`
);
```

changing `hosts[i]` to the ip address of the computer you are hosting the game on, i.e 12.345.678.91.

NOTE: this is sort of a hacky solution right now, but will be due to change in the future

Build the client & server:
```sh
pnpm -r build
```

Make sure the build directory has the proper permissions:
```sh
sudo chown -R www-data:www-data /opt/resurviv/client/dist
```

### Setting up NGINX
We will now setup NGINX to serve the client, server API, and WebSocket server.

First, remove the default file:
```sh
sudo unlink /etc/nginx/sites-enabled/default
sudo rm /etc/nginx/sites-available/default
```

Create a new file:
```sh
nano /etc/nginx/sites-available/resurviv.conf
```

And populate it with the following content:
```nginx
server {
    listen 80 default_server;
    listen [::]:80 default_server;

    server_name _;

    # Client build
    location / {
        root /opt/resurviv/client/dist;
    }

    # API server
    location /api {
        proxy_http_version 1.1;

        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Host $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Host $http_host;

        proxy_pass "http://127.0.0.1:8000";
    }

    # WebSocket server
    location /play {
        proxy_http_version 1.1;

        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Host $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Host $http_host;

        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";

        proxy_pass "http://127.0.0.1:8000";
        proxy_redirect off;
    }

    # Team WebSocket server
    location /team_v2 {
        proxy_http_version 1.1;

        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Host $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Host $http_host;

        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";

        proxy_pass "http://127.0.0.1:8000";
        proxy_redirect off;
    }
}
```

Save the file using `Ctrl + X`, and press `Y` to confirm the file name.

To enable the configuration:
```sh
sudo ln -s /etc/nginx/sites-available/resurviv.conf /etc/nginx/sites-enabled/resurviv.conf
sudo systemctl restart nginx
```

### Running the game server
Next, we will create a systemd unit file, which will ensure our application starts at boot and won't terminate if we end our SSH session:
```sh
sudo nano /etc/systemd/system/resurviv.service
```

And populate it with the following content:
```ini
[Unit]
Description=Resurviv dedicated server.

[Service]
Type=simple
WorkingDirectory=/opt/resurviv/server
ExecStart=/usr/bin/pnpm start

[Install]
WantedBy=multi-user.target
```

Save the file using `Ctrl + X`, and press `Y` to confirm the file name.

Enable the unit:
```sh
sudo systemctl daemon-reload
sudo systemctl enable --now resurviv
```

If you've done everything correctly, you should be able to access the server at `http://youriphere` (ex: `http://1.1.1.1`).
Congratulations! You can stop here.

### Security
Optionally, let's install a firewall to keep your server safe:
```sh
sudo apt -y install ufw fail2ban
```

Allow the correct ports.
```sh
sudo ufw limit 22/tcp
sudo ufw allow 80/tcp
```

**NOTE:** If you are using an SSH port other than 22, adjust accordingly.

Enable the firewall.
```sh
sudo ufw enable
```

And that's it! You're all good to go.
