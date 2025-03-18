echo "\n--- Creating mongodb user and resetting collection..."
docker cp backend/mongodb-init.js playerok-mongodb:/mongodb-init.js
sleep 1 # wait until mongo get up
docker exec -it playerok-mongodb mongo mongodb-init.js
echo "\n--- Starting playerok-mongodb container..."
docker start playerok-mongodb

echo "\n--- Running node.js server..."
cd backend
npm run start
