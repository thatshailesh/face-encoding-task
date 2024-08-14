# Use Node.js 18 LTS as a base image
FROM node:20.10.0-alpine

# Set the working directory in the container
WORKDIR /app

# Copy package.json and yarn.lock to the container
COPY package.json yarn.lock ./

# Install project dependencies using Yarn
RUN yarn install

# Copy the rest of your application code
COPY . .

# Build application
RUN yarn build

# Expose the port your Fastify server is listening on
EXPOSE 3000


# Start your NestJS application
CMD ["yarn", "start:prod"]
