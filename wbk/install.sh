echo "\n--- Removing existing container 'playerok-mongodb'..."
docker stop playerok-mongodb
docker rm playerok-mongodb
echo "\n--- Installing legacy mongo 4.4 for non-avx cpu..."
docker run -d --name playerok-mongodb -p 27017:27017 -e MONGO_INITDB_ROOT_USERNAME=admin -e MONGO_INITDB_ROOT_PASSWORD=pass mongo:4.4
echo "\n--- Docker configuration done."

echo "\n--- Configuring backend..."
cd backend
npm i
echo "\n--- Copying .env.example to .env if .env doesn't exist..."
cp -n .env.example .env 2>/dev/null
echo "\n--- Please make adjustments to .env file!"
