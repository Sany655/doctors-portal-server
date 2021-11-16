const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { MongoClient } = require('mongodb');
// const ObjectId = require('mongodb').ObjectId;
const admin = require("firebase-admin");
const { getAuth } = require('firebase-admin/auth');
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
const expressFileUpload = require('express-fileupload');

const app = express()
const port = process.env.PORT || 5000;

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

// middlewares
app.use(cors());
app.use(express.json());
app.use(expressFileUpload());

app.get('/', (req, res) => {
    res.send('Doctors Portal');
})

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.e2cer.mongodb.net/${process.env.DB}?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });

async function verifyToken(req,res,next) {
    if (req?.headers?.authorization?.startsWith('Bearer ')) {
        const idToken = req.headers.authorization.split('Bearer ')[1];
        try {
            const userDecoded = await admin.auth().verifyIdToken(idToken)
            req.userDecoded = userDecoded.email;
        } catch (error) {
            console.log(error);
        }
    }
    next()
}

// admin related api here ** experiments **
app.get('/admin/users',verifyToken, async (req,res)=>{
    getAuth().listUsers()
    .then((userList)=>{
        // userList.users.forEach((userRecord)=>{
        //     res.json(userRecord.toJSON())
        //     console.log('user', userRecord.toJSON());
        // })
        res.send(userList.users)
        if (userList.pageToken) {
            // call this function again and again (recursion) to get all users at once if users will be above 1000
        }
    }).catch((error)=>{
        console.log(error);
    })
})

async function run() {
    try {
        await client.connect();
        console.log('connected');
        const db = client.db(process.env.DB);
        const appointments = await db.collection('appointments');
        const users = await db.collection('users');
        const doctors = await db.collection('doctors');

        // appointments api here

        // take an appointment
        app.post('/appointments', async (req, res) => {
            const result = await appointments.insertOne(req.body)
            res.send(result);
        })

        // get my appointments
        app.get('/appointments',verifyToken, async (req, res) => {
            const result = await appointments.find({uid:req.query.uid,date:new Date(req.query.date).toLocaleDateString()}).toArray()
            res.json(result);
        })

        // users api here
        app.get('/users/:email', async (req, res) => {
            const result = await users.findOne({email:req.params.email})
            const response = result?.role==='admin'?true:false;
            res.send(response);
        })

        // after register user via email and password
        app.post('/users', async (req, res) => {
            const result = await users.insertOne(req.body)
            res.send(result);
        })

        // after google signin
        app.put('/users', async (req,res) => {
            const result = await users.updateOne({email: req.body.email},{$set:req.body},{upsert:true});
            res.send(result);
        })

        // an admin makes admin any user
        app.put('/users/admin',verifyToken, async (req,res) => {
            if (req.userDecoded) {
                const resquesterAccount = await users.findOne({email:req.userDecoded});
                if (resquesterAccount.role=='admin') {
                    const reqstedUser = await users.findOne({email:req.body.email});
                    if (reqstedUser.role == 'admin') {
                        const result = await users.updateOne({email: req.body.email},{$set:{role:'user'}});
                        if (result.modifiedCount) {
                            res.send(res.send(`${req.body.email} is not an admin now`));
                        }else{
                            res.send(res.send(`Something went wrong`));
                        }
                    }else{
                        const result = await users.updateOne({email: req.body.email},{$set:{role:'admin'}});
                        if (result.modifiedCount) {
                            res.send(res.send(`${req.body.email} is an admin now`));
                        }else{
                            res.send(res.send(`Something went wrong`));
                        }
                    }
                }else{
                    res.send('Authorization denied!')
                }
            }else{
                res.send('Authorization denied!')
            }
        })

        // doctors api here

        app.get('/doctors', async (req,res) => {
            const result = await doctors.find({}).toArray();
            res.send(result)
        })

        app.post('/doctors', async (req,res)=>{
            const name = req.body.name;
            const email = req.body.email;
            const pic = req.files.img;
            const picData = pic.data;
            const encodedPic = picData.toString('base64');
            const imageBuffer = Buffer.from(encodedPic, 'base64');
            const doctor = {
                name,
                email,
                image:imageBuffer
            }
            const result = await doctors.insertOne(doctor)
            res.send(result)
        })

    } finally {
        // await client.close()
    }
}

run().catch(console.dir)

app.listen(port, () => {
    console.log('doctors portal - http://localhost:5000');
})