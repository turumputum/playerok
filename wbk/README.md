# FileManager

## Installation
- Docker (https://docs.docker.com/engine/install/)
```sh
./install.sh
# Make your adjustments to `backend/.env` and restart
# then
./run.sh
```
backend by default uses pre-built frontend, if you want to develop frontend, see below.

## Frontend development:
```sh
cd frontend
npm i
npm run dev
```
use a link from your terminal.

## Other

Manage MongoDB:
```sh
docker exec -it mongodb mongosh -u admin -p pass
```
