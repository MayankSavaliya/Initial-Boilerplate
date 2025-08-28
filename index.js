import express from "express";
import dotenv from "dotenv";
import cors from "cors";
// import bodyParser from "body-parser";
import mongoose from "mongoose";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));



//connetion to the database
const connectDb = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/');
    console.log("Db connection successful");
  }
  catch (error) {
    console.log("Error", error);
  }
}


const locationschema = new mongoose.Schema({
  location_code: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
  },
  parent_location_code: {
    type: String,
    default: null
  },
  type: {
    type: String,
    required: true,
    enum: ['Warehouse', 'Storage']
  }
}, { timestamps: true });


const productscehma = new mongoose.Schema({
  product_code: {
    type: String,
    required: true,
    unique: true,
    uppercase: true
  },
  location_code:{
    type:String,
    required:true,
  },
  volume: {
    type: Number,
    default: 0.0
  },
  quantity:{
    type:Number,
    default:0
  }
}, { timestamps: true });

const transactionSchema = new mongoose.Schema({
  transaction_date:{
    type:String,
    required:true
  },
  warehouse_code:{
    type:String,
    required:true
  }
});

const Location = mongoose.model('Location', locationschema);
const Product = mongoose.model('Product', productscehma);

const getWareHouse = async (location_code) => {
  try {
    const location = Location.findOne({location_code});

    // console.log(location_code);
    // console.log({location});
    while (location && location.type != 'Warehouse') {
      if (!location.parent_location_code) break;
      location = await Location.findOne({ location_code: location.parent_location_code});
    }
    return location ? location.location_code : null;
  }
  catch (error) {
    console.error('Error Finding Warehouse', error);
    return null;
  }
}


const validateLocation = async (location_code, parent_location_code, location_type) => {
  //null parent mate type warehouse
  if (!parent_location_code && location_type !== 'Warehouse') {
    return { valid: false, message: "warehouse creation failed" };
  } 

  if (parent_location_code) {
    const parent = await Location.findOne({ location_code: parent_location_code });

    if (!parent) {
      return { valid: false, message: `Parent location ${parent_location_code} does not exist` };
    }

    if (location_type == 'Warehouse') {
      return { valid: false, message: "Ware-house does not have parent" };
    }
    else if (location_type == 'Storage' && parent.type != 'Warehouse') {
      return { valid: false, message: "Storage must have parent warehouse" }
    }

  }
  return { valid: true, message: "Suceess" };
}

  //1st api Create the warehouse
  app.post('/api/create_location', async (req, res) => {
    try {
      const { location_code, parent_location_code} = req.body;

      var type = "Warehouse";

      if (!location_code) {
        return res.status(400).json({
          success: false,
          message: 'Locatoin_code is required'
        });
      }
      // console.log(type);
      if(location_code.includes("BIN")){
        type = "Storage"
      }

      const existinglocation = await Location.findOne({ location_code });

      if (existinglocation) {
        return res.status(400).json({
          success: false,
          message: "Location already exist"
        })
      }

      //first check valid 
      const check = await validateLocation(location_code, parent_location_code, type);
      // console.log(check);
      if (!check.valid) {
        return res.status(400).json({
          success: false,
          message: check.message
        });
      }

      const location = new Location({
        location_code: location_code.toUpperCase(),
        parent_location_code: parent_location_code ? parent_location_code.toUpperCase() : null,
        type
      });

      //save
      await location.save();

      res.json({
        success: true,
        message: "location Created sucessfully",
        data: {
          location_code: location.location_code,
          parent_location_code: location.parent_location_code,
          type: location.type
        }
      });
    }
    catch (error) {
      console.log("Location creation Error", error);
      res.status(500).json({
        success: false,
        message: error.message
      })
    }
  })




  //3rd api Add Product to ware house
  app.post('/api/transaction/receipt', async (req, res) => {
    try {
      const { transaction_date, warehouse_code, products = [] } = req.body;

      const warehouse = await Location.findOne({
        location_code: warehouse_code.toUpperCase(),
        type: 'Warehouse'
      });

      if (!warehouse) {
        return res.status(404).json({
          success: false,
          message: 'Warehouse not found'
        })
      }

      for (const productData of products) {
        const { product_code, qty = 0, volume = 0.0, location_code } = productData;

        //find the location
        const wareHouseCode = await getWareHouse(location_code.toUpperCase());
        // console.log(wareHouseCode);
        if (wareHouseCode !== warehouse_code.toUpperCase()) {
          return res.status(400).json({
            success: false,
            message: "Ware house and product parent code are not same",
          })
        }
        const product = Product.findOne({product_code:product_code.toUpperCase()})

        let oldQty = product.quantity;

        await product.updateOne({
          product_code,
          location_code,
          volume:volume,
          quantity : oldQty + qty
        });
      }

      res.json({
        success:true,
        messsage : "Product Added Successfully"
      });
    }
    catch(error){
      console.log("Add Proudct error", error);
      res.status(500).json({
        suceess:false,
        message:error.message
      })
    }
})











  // Simple root route
  app.get('/', (req, res) => {
    res.json({
      message: 'Welcome',
      status: 'Server is running successfully',
      timestamp: new Date().toISOString()
    });
  });

  app.listen(PORT, () => {
    connectDb();
    console.log(`🚀 Server is running on http://localhost:${PORT}`);
  });
