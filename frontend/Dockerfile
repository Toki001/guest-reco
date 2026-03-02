# Use a lightweight Node.js image
FROM node:18-alpine

# Set the working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy the rest of the frontend code
COPY . .

# Expose the port React runs on
EXPOSE 3000

# Start the React development server
# (If you are using Vite, change this to CMD ["npm", "run", "dev", "--", "--host"])
CMD ["npm", "start"]