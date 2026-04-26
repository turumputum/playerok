db = connect("mongodb://admin:pass@localhost:27017/admin");

db = db.getSiblingDB("Playerok"); // Create or switch to "mydatabase"

// Create a collection
db.createCollection("filesystems");

// Create a new user with readWrite permissions on "mydatabase"
if (!db.getUser("playerok")) {
    db.createUser({
        user: "playerok",
        pwd: "123ok123",
        roles: [{ role: "readWrite", db: "Playerok" }]
    });
}

print("Database, collection, and user created successfully.");