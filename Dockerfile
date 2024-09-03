# Use the official Node.js 18 image as a base
FROM node:18

# Set the working directory inside the container
WORKDIR /app

# Copy the package.json and package-lock.json files to the working directory
COPY package*.json ./

# Install only production dependencies
RUN npm install --production

# Copy the rest of the application code to the working directory
COPY src ./src

# Expose the port the app runs on
EXPOSE 3000

# Command to start the application
CMD ["npm", "start"]
