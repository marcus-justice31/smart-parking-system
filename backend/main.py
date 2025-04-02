from fastapi import FastAPI, HTTPException
from pymongo import MongoClient
from pydantic import BaseModel
from typing import List
from fastapi.middleware.cors import CORSMiddleware

# MongoDB connection URI
uri = "mongodb+srv://marcusjusticeuy:Xgkx3sTUuCz5UutA@cluster0.fbsorsx.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0"
client = MongoClient(uri)

# Create a database and collection
db = client.parking_db
user_collection = db["users"]
parking_collection = db["parking_spots"]

app = FastAPI()

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods (GET, POST, PUT, DELETE)
    allow_headers=["*"],  # Allows all headers
)

# User model for login and user creation
class User(BaseModel):
    username: str
    password: str
    reserved_spots: List[int] = []
    wallet: float = 0.0

# ParkingSpot model
class ParkingSpot(BaseModel):
    spot_id: int
    availability: bool
    user_spot: str = None  # Stores the username of the user who reserved it
    price: float

@app.get("/user/login")
def login(username: str, pswd: str):
    # Find the user by username in MongoDB
    user = user_collection.find_one({"username": username})
    
    if user:
        if user["password"] == pswd:
            return {"Login": "Successful"}
        else:
            raise HTTPException(status_code=400, detail="Invalid password")
    else:
        raise HTTPException(status_code=404, detail="User not found")

@app.post("/user/create")
def createUser(username: str, password: str):
    # Check if the user already exists
    existing_user = user_collection.find_one({"username": username})
    if existing_user:
        raise HTTPException(status_code=400, detail="User already exists")
    
    # Create a user instance with default wallet and reserved_spots values
    new_user = User(username=username, password=password)
    
    # Insert the new user into MongoDB
    user_collection.insert_one(new_user.dict())
    
    return {"message": "User created successfully"}

@app.get("/user/{username}/parking_spots")
def get_reserved_spots(username: str):
    # Find all parking spots reserved by the user
    reserved_spots = list(parking_collection.find({"user_spot": username}, {"_id": 0}))

    # If no reserved spots are found, return an empty list
    return {"Reserved Parking Spots": reserved_spots}

@app.put("/user/{username}/updateWallet")
def updateWallet(username: str, amount: float):
    # Find the user by username
    user = user_collection.find_one({"username": username})
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Check if the amount to add is positive
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be greater than zero")

    # Update the wallet balance by adding the specified amount
    updated_wallet_balance = user["wallet"] + amount
    
    # Update the user’s wallet with the new balance
    result = user_collection.update_one(
        {"username": username},
        {"$set": {"wallet": updated_wallet_balance}}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=500, detail="Failed to update the wallet balance")
    
    return {"message": f"User {username}'s wallet updated successfully by {amount}. New balance: {updated_wallet_balance}", "wallet_balance": updated_wallet_balance}

@app.put("/user/{username}/minusFunds")
def minusFunds(username: str, amount: float):
    # Find the user by username
    user = user_collection.find_one({"username": username})
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Check if the amount to add is positive
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be greater than zero")

    # Update the wallet balance by adding the specified amount
    updated_wallet_balance = user["wallet"] - amount
    
    # Update the user’s wallet with the new balance
    result = user_collection.update_one(
        {"username": username},
        {"$set": {"wallet": updated_wallet_balance}}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=500, detail="Failed to update the wallet balance")
    
    return {"message": f"User {username}'s wallet updated successfully by {amount}. New balance: {updated_wallet_balance}", "wallet_balance": updated_wallet_balance}

@app.get("/user/{username}/getWallet")
def getWallet(username: str):
    if username == "admin":  
        return {"message": "Admin does not have a wallet"}
    
    # Find the user by username
    user = user_collection.find_one({"username": username})
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Return the user's wallet balance
    return {"username": username, "wallet_balance": user["wallet"]}


@app.get("/parking")
def getSpots():
    parking_spots = list(parking_collection.find({}, {"_id": 0}))  # Exclude _id
    return {"Parking Spots": parking_spots}

@app.get("/parking/availability")
def get_parking_availability():
    available_spots = list(parking_collection.find({"availability": True}, {"_id": 0}))  # Exclude _id
    if available_spots:
        return {"Available Parking Spots": available_spots}
    else:
        raise HTTPException(status_code=404, detail="No available parking spots found")

@app.put("/parking/reserve/{parking_id}")
def reserveSpot(parking_id: int, username: str):
    spot = parking_collection.find_one({"spot_id": parking_id}, {"_id": 0})  # Exclude _id

    if not spot:
        raise HTTPException(status_code=404, detail="Parking Spot Doesn't Exist")

    if not spot["availability"]:
        raise HTTPException(status_code=400, detail="Parking Spot Is Not Available")

    # Update the spot availability and assign user who reserved it
    result = parking_collection.update_one(
        {"spot_id": parking_id},
        {"$set": {"availability": False, "user_spot": username}}
    )

    if result.modified_count == 0:
        raise HTTPException(status_code=500, detail="Failed to reserve the parking spot")
    
    # Update the user's reserved spots
    user_collection.update_one(
        {"username": username},
        {"$push": {"reserved_spots": parking_id}}  # Add the parking spot to the reserved_spots array
    )

    return {"message": f"Parking Spot {parking_id} reserved successfully by {username}"}

@app.put("/parking/release/{parking_id}")
def releaseSpot(parking_id: int):
    # Find the parking spot
    spot = parking_collection.find_one({"spot_id": parking_id})
    if not spot:
        raise HTTPException(status_code=404, detail="Parking Spot Doesn't Exist")
    
    # Check if the parking spot is reserved
    if spot["availability"]:
        raise HTTPException(status_code=400, detail="Parking Spot Was Not Reserved")
    
    # Find the user who reserved the spot
    username = spot["user_spot"]

    # Update the parking spot to be available again
    parking_collection.update_one(
        {"spot_id": parking_id},
        {"$set": {"availability": True, "user_spot": None}}
    )
    
    # Remove the parking spot from the user's reserved spots array
    user_collection.update_one(
        {"username": username},
        {"$pull": {"reserved_spots": parking_id}}  # Remove the spot from reserved_spots
    )

    return {"message": f"Parking Spot {parking_id} released successfully, and removed from {username}'s reserved spots"}


@app.post("/parking/create")
def createParkingSpot(new_spot_data: ParkingSpot):
    price = new_spot_data.price  # Extract price from the request body

    # Find the highest spot_id and increment it
    last_spot = parking_collection.find_one(sort=[("spot_id", -1)])  # Get the highest spot_id
    new_spot_id = (last_spot["spot_id"] + 1) if last_spot else 1  # Increment or start at 1

    # New parking spot data
    new_spot = {
        "spot_id": new_spot_id,
        "price": price,
        "availability": True,  # Always available when created
        "user_spot": ""  # Empty string since no one reserved it yet
    }

    # Insert the new parking spot into MongoDB
    parking_collection.insert_one(new_spot)

    return {"message": f"Parking Spot {new_spot_id} created successfully"}

@app.delete("/parking/delete/{parking_id}")
def deleteParkingSpot(parking_id: int):
    spot = parking_collection.find_one({"spot_id": parking_id})
    if not spot:
        raise HTTPException(status_code=404, detail="Parking Spot Doesn't Exist")
    
    # Delete the parking spot from the collection
    result = parking_collection.delete_one({"spot_id": parking_id})
    
    if result.deleted_count > 0:
        return {"message": f"Parking Spot {parking_id} deleted successfully"}
    else:
        raise HTTPException(status_code=404, detail="Parking Spot not found")

    
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)