FROM node:lts-alpine

LABEL com.centurylinklabs.watchtower.enable=true
ENV DEBUG=tinfoil*
ENV ROMS_DIR_FULLPATH=/games
ENV TINFOIL_HAT_PORT=80
ENV NX_PORTS=5000

# The container will run at root level of container
# to avoid long syntax when mounting /games folder

# Create the games directory
RUN mkdir -p /games

# Copy the package.json and package-lock.json
# It's good practice to copy these first to leverage Docker's build cache
# If package.json or package-lock.json don't change, this layer won't rebuild
COPY package*.json /

# Set the working directory to the root of the container
WORKDIR /

# Install the app dependencies using npm ci for a clean, reproducible build
# npm ci uses the package-lock.json file to install exact versions,
# which is ideal for CI/CD and Docker builds.
# The --production flag ensures only production dependencies are installed.
RUN npm ci --production

# Copy the application code
# This step should be after npm ci to ensure node_modules are built based on lockfile
COPY . /

# Expose the app TINFOIL_HAT_PORT
EXPOSE ${TINFOIL_HAT_PORT}

# Start the app
CMD ["npm", "start"]
