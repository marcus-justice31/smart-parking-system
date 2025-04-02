import React, { useState, useEffect } from 'react';
import axios from 'axios';

const SmartParkingUI = () => {
    const [spots, setSpots] = useState([]);
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [isAdmin, setIsAdmin] = useState(false);
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [error, setError] = useState(null);
    // const [newSpotPrice, setNewSpotPrice] = useState('');
    const [walletBalance, setWalletBalance] = useState(0);
    const [addFundsAmount, setAddFundsAmount] = useState('');
    const [reservedSpots, setReservedSpots] = useState([]);
    const [showReservedModal, setShowReservedModal] = useState(false);
    const [peakHoursMessage, setPeakHoursMessage] = useState('');

    // Hardcoded credentials for testing
    const hardcodedUsers = {
        "admin": "admin",
        "user": "user"
    };

    const getPriceMultiplier = () => {
        const currentHour = new Date().getHours();
        let multiplier = 1;
        let message = '';

        // Apply different multipliers based on the time of day
        if (currentHour >= 8 && currentHour <= 18) {  // Peak hours: 8 AM - 6 PM
            multiplier = 1.5;  // 1.5x during peak hours
            message = 'Peak hours: 8 AM - 6 PM. Prices are 1.5x during this time.'; // Set peak hours message
        } else {  // Off-peak hours
            multiplier = 1;
            message = 'Off-peak hours: Prices are at normal rates.'; // Set off-peak hours message
        }

        setPeakHoursMessage(message); // Update the peak hours message state
        return multiplier;
    };
    

    // Fetch parking spots from the backend
    const fetchSpots = async () => {
        try {
            const response = await axios.get('http://localhost:8000/parking');
            console.log(response.data); // Check the response structure
    
            const priceMultiplier = getPriceMultiplier();  // Get the current price multiplier based on the time of day
    
            // Map parking spots to the structure expected by the UI
            const spots = response.data["Parking Spots"].map((spot) => ({
                id: spot.spot_id,
                originalPrice: spot.price.toFixed(2),  // Store original price
                price: (spot.price * priceMultiplier).toFixed(2),  // Apply multiplier
                reserved: !spot.availability,
                user: spot.user_spot || "N/A",
            }));
    
            setSpots(spots);
        } catch (err) {
            console.error('Error fetching parking spots:', err);
        }
    };
    

    // Call the fetchSpots function when the component mounts
    useEffect(() => {
        fetchSpots();
    }, []);

    // Login using FastAPI and hardcoded credentials for admin check
    const handleLogin = async () => {
        try {
            // First check hardcoded credentials for "admin"
            if (hardcodedUsers[username] === password) {
                setIsLoggedIn(true);
                setIsAdmin(username === 'admin');
                setError(null);
            } else {
                // Now attempt login via FastAPI endpoint
                const response = await axios.get(`http://localhost:8000/user/login?username=${username}&pswd=${password}`);
                if (response.data.Login === "Successful") {
                    setIsLoggedIn(true);
                    setIsAdmin(username === 'admin');
                    setError(null);
                }
            }
        } catch (err) {
            // Handle error from FastAPI (invalid credentials)
            setError('Invalid credentials');
        }
    };

    const handleAddFunds = async () => {
        try {
            const response = await axios.put(`http://localhost:8000/user/${username}/updateWallet?amount=${addFundsAmount}`);
            setWalletBalance(response.data.wallet_balance); // Update the wallet balance
            alert(response.data.message);
            setAddFundsAmount('') // Clear input field
        } catch (err) {
            console.error('Error adding funds:', err);
            alert('Failed to add funds');
        }
    };
    
    // Logout
    const handleLogout = () => {
        setIsLoggedIn(false);
        setIsAdmin(false);
        setUsername('');
        setPassword('');
        setError(null);
    };

    // Create an account
    const handleCreateAccount = async () => {
        try {
            const response = await axios.post(`http://localhost:8000/user/create?username=${username}&password=${password}`);
            if (response.status === 200) {
                alert("Account created successfully!");
                setUsername('');
                setPassword('');
                setError(null);
            } else {
                setError("Account creation failed.");
            }
        } catch (err) {
            setError("Username already exists.");
            console.error('Error creating account:', err);
        }
    };

    // Reserve a parking spot using FastAPI
    const reserveSpot = async (spotId) => {
        if (username) {  // Ensure a user is logged in
            try {
                // Get the price of the selected spot
                const selectedSpot = spots.find((spot) => spot.id === spotId);
                const spotPrice = selectedSpot ? selectedSpot.price : 0;

                // Check if the user has enough balance
                if (walletBalance >= spotPrice) {
                    // Make API call to reserve the spot
                    await axios.put(`http://localhost:8000/parking/reserve/${spotId}?username=${username}`);

                    // Update the spots state to mark the spot as reserved
                    setSpots(spots.map((spot) =>
                        spot.id === spotId ? { ...spot, reserved: true } : spot
                    ));
                    // Deduct the amount from the user's wallet balance
                    const response = await axios.put(`http://localhost:8000/user/${username}/minusFunds?amount=${spotPrice}`);
                    setWalletBalance(response.data.wallet_balance);  // Update the wallet balance

                    alert(`Spot reserved successfully! Your new balance is $${response.data.wallet_balance}`);
                } else {
                    alert('Insufficient funds to reserve this spot');
                }
            } catch (err) {
                console.error('Error reserving spot:', err);
                alert('Failed to reserve spot');
            }
        } else {
            alert('User must be logged in to reserve a spot');
        }
    };

    // Reserve Check
    const handleReservedCheck = async () => {
        try {
            const response = await axios.get(`http://localhost:8000/user/${username}/parking_spots`);
            
            if (response.data && response.data["Reserved Parking Spots"] && response.data["Reserved Parking Spots"].length > 0) {
                setReservedSpots(response.data["Reserved Parking Spots"]);
                toggleReservedModal();
            } else {
                alert("You have no reserved spots.");
            }
        } catch (err) {
            console.error('Error fetching reserved spots:', err);
            alert("Failed to fetch reserved spots.");
        }
    };
    
    

    // Release a parking spot using FastAPI (Admin only)
    const releaseSpot = (spotId) => {
        axios.put(`http://localhost:8000/parking/release/${spotId}`)
            .then(() => {
                setSpots(spots.map((spot) =>
                    spot.id === spotId ? { ...spot, reserved: false } : spot
                ));
            })
            .catch((err) => console.error('Error releasing spot:', err));
    };
    
    const addSpot = () => {
        const price = parseFloat(prompt('Enter the price for the new spot:')); // Prompt the admin for the price
        
        if (isNaN(price) || price <= 0) {
            alert('Please enter a valid price greater than 0.');
            return;
        }
        
        const newSpot = {
            spot_id: 0,
            price: price,
            availability: true,  
            user_spot: ""  
        };
        
        // Send the price as JSON in the request body
        axios.post('http://localhost:8000/parking/create', newSpot)
            .then((response) => {
                alert(response.data.message);  // Show success message
                refreshSpots();  // Refresh the spots to reflect the new addition
            })
            .catch((err) => {
                console.error('Error adding spot:', err);
                alert('Error adding parking spot');
            });
    };

    const deleteSpot = (spotId) => {
        axios.delete(`http://localhost:8000/parking/delete/${spotId}`)
            .then((response) => {
                alert(response.data.message);  // Show success message
                refreshSpots();  // Refresh the spots to reflect the removal
            })
            .catch((err) => {
                console.error('Error deleting spot:', err);
                alert('Error deleting parking spot');
            });
    };

    // Toggle the reserved spots modal
    const toggleReservedModal = () => {
        setShowReservedModal(!showReservedModal);
    };

    // Refresh parking spots
    const refreshSpots = () => {
        fetchSpots();
    };

    useEffect(() => {
        if (isLoggedIn) {
            fetchSpots(); // Re-fetch spots after login
            const fetchWalletBalance = async () => {
                try {
                    const response = await axios.get(`http://localhost:8000/user/${username}/getWallet`);
                    setWalletBalance(response.data.wallet_balance);
                } catch (err) {
                    console.error('Error fetching wallet balance:', err);
                }
            };
            fetchWalletBalance();
        }
    }, [isLoggedIn, username]);
    

    return (
        <div style={{
            fontFamily: 'Arial, sans-serif',
            textAlign: 'center',
            padding: '20px',
            background: 'black',
            color: 'white',
            minHeight: '100vh',
        }}>
            <style>
                {`
                    button {
                        margin: 5px;
                        padding: 8px 16px;
                        border-radius: 8px;
                        border: none;
                        outline: none;
                        background-color: #6a0dad;
                        color: white;
                        cursor: pointer;
                        transition: background-color 0.3s ease;
                    }
                    button:hover {
                        background-color: #8a2be2;
                    }
                    input {
                        margin: 5px;
                        padding: 10px;
                        border-radius: 8px;
                        border: 1px solid #555;
                        background-color: #333;
                        color: white;
                    }
                    .header {
                        background-color: #6a0dad;
                        color: white;
                        padding: 20px;
                        margin-bottom: 10px;
                        border-radius: 8px;
                    }
                `}
            </style>
            <h1 style={{ fontSize: '50px', marginBottom: '30px' }}>Smart Parking</h1>
            {/* Display peak hours message */}
            <p style={{ fontSize: '20px', color: '#FF6347', fontWeight: 'bold' }}>{peakHoursMessage}</p>
            {!isLoggedIn ? (
                <div style={{ display: 'inline-block', padding: '20px', borderRadius: '8px', backgroundColor: '#333' }}>
                    <input
                        type="text"
                        placeholder="Username"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                    /><br />
                    <input
                        type="password"
                        placeholder="Password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                    /><br />
                    <button onClick={handleLogin}>Login</button>
                    <button onClick={handleCreateAccount}>Create Account</button>
                    {error && <p style={{ color: 'red' }}>{error}</p>}
                </div>
            ) : (
                <div>
                    {!isAdmin && (
                        <div>
                            <h3>{username}'s Wallet Balance: ${walletBalance}</h3>
                            <input
                                type="number"
                                value={addFundsAmount}
                                onChange={(e) => setAddFundsAmount(e.target.value)}
                                placeholder="Enter amount to add"
                            />
                            <button onClick={handleAddFunds}>Add Funds</button>
                        </div>
                    )}
                    {isAdmin && (
                        <div>
                            <button onClick={addSpot}>Add Parking Spot</button>
                        </div>
                    )}
                    <button onClick={handleLogout} style={{ position: 'absolute', right: '20px', top: '10px' }}>Logout</button>
                    <button onClick={handleReservedCheck} style={{ margin: '5px', padding: '8px 16px', borderRadius: '8px', backgroundColor: '#6a0dad', color: 'white', border: '1px solid white', display: isAdmin ? 'none' : 'inline-block'}}>Check Reserved</button>
                    {showReservedModal && (
                        <div className="modal-overlay" onClick={toggleReservedModal}>
                            <div className="modal" onClick={(e) => e.stopPropagation()}>
                                <h3>Reserved Spots</h3>
                                {reservedSpots.length > 0 ? (
                                    reservedSpots.map((spot) => (
                                        <p key={spot.spot_id}>Parking Spot {spot.spot_id} - Price: ${spot.price}</p>
                                    ))
                                ) : (
                                    <p>You have no reserved spots.</p>  /* This message is displayed when there are no reserved spots */
                                )}
                                <button onClick={toggleReservedModal} style={{ margin: '5px', padding: '8px 16px', borderRadius: '8px', backgroundColor: '#8a2be2', color: 'white' }}>Close</button>
                            </div>
                        </div>
                    )}

                    <div className="header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h2>{isAdmin ? 'Admin Dashboard' : 'User Dashboard'}</h2>
                        <button onClick={refreshSpots} style={{ backgroundColor: '#8a2be2', padding: '8px 16px' }}>Refresh</button>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap' }}>
                        {spots.map((spot) => (
                            <div key={spot.id} style={{
                                border: '1px solid white',
                                padding: isAdmin ? '5px' : '20px',  // Smaller padding for admin
                                margin: isAdmin ? 'px' : '10px',    // Smaller margin for admin
                                borderRadius: '8px',
                                backgroundColor: spot.reserved ? '#555' : '#222', // Different color for reserved spots
                            }}>
                                <h3>Spot {spot.id}</h3>
                                <p>Original Price: <del>${spot.originalPrice}/hr</del></p>
                                <p style={{ fontWeight: 'bold', color: '#FFA500' }}>Current Price: ${spot.price}/hr</p>
                                
                                {/* Conditionally render the status message and color */}
                                <p style={{ color: spot.reserved ? 'red' : 'green' }}>
                                    Status: {spot.reserved ? (isAdmin ? `Reserved by ${spot.user}` : 'Reserved') : 'Available'}
                                </p>
                                
                                {/* Conditionally render the button based on user role */}
                                {isAdmin ? (
                                    <>
                                        <button onClick={() => releaseSpot(spot.id)}>
                                            Release
                                        </button>
                                        <button onClick={() => deleteSpot(spot.id)}>
                                            Delete Parking Spot
                                        </button>
                                    </>
                                ) : (
                                    !spot.reserved && (
                                        <button onClick={() => reserveSpot(spot.id)}>
                                            Reserve
                                        </button>
                                    )
                                )}
                            </div>
                        ))}
                    </div>


                </div>
            )}
        </div>
    );
};

export default SmartParkingUI;