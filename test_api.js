
const fetch = require("node-fetch");

async function testMovementsAPI() {
  try {
    const response = await fetch("http://localhost:3000/api/warehouses/4/movements?limit=3");
    
    if (!response.ok) {
      console.error(`API error: ${response.status} ${response.statusText}`);
      const errorText = await response.text();
      console.error(`Error details: ${errorText}`);
      return;
    }
    
    const data = await response.json();
    console.log(JSON.stringify(data, null, 2).substring(0, 1000));
    console.log(`Total movements returned: ${data.length}`);
  } catch (error) {
    console.error("Error testing API:", error);
  }
}

testMovementsAPI();

