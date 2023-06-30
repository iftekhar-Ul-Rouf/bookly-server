const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const app = express();
const stripe = require("stripe")(process.env.STRIP_KEY);
const port = process.env.PORT || 4000;

// middlewares
app.use(cors());
app.use(express.json());


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.w2hsrgs.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

// ferifytoken function
function verifyToken(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        res.status(401).send('Unauthorized Access');
    }
    const token = authHeader.split(' ')[1];
    jwt.verify(token, process.env.ACCESS_TOKEN, function (error, decoded) {
        if (error) {
            res.status(403).send({ message: 'Forbidden Access' });
        }
        else {
            req.decoded = decoded;
            next();
        }
    })
}

async function run() {
    try {
        const categoriesCollection = client.db('bookly').collection('categories');
        const usersCollection = client.db('bookly').collection('users');
        const booksCollection = client.db('bookly').collection('books');
        const bookingsCollection = client.db('bookly').collection('bookings');
        const selervarificationsCollection = client.db('bookly').collection('selervarifications');
        const reportsCollection = client.db('bookly').collection('reports');
        const paymentsCollection = client.db('bookly').collection('payments');

        // verifing user roles
        const verifyseler = async (req, res, next) => {
            const decodedEmail = req.decoded.email;
            const query = { email: decodedEmail };
            const user = await usersCollection.findOne(query);

            if (user?.role !== 'Seler') {
                return res.status(403).send({ message: 'forbidden access' })
            }
            next();
        }
        const verifyAdmin = async (req, res, next) => {
            const decodedEmail = req.decoded.email;
            const query = { email: decodedEmail };
            const user = await usersCollection.findOne(query);

            if (user?.role !== 'admin') {
                return res.status(403).send({ message: 'forbidden access' })
            }
            next();
        }
        // all post methods are down below
        app.post('/create-payment-intent', async (req, res) => {
            const order = req.body;
            const price = order.price;
            const amount = price * 100;
            const paymentIntent = await stripe.paymentIntents.create({
                currency: 'usd',
                amount,
                "payment_method_types": [
                    "card"
                ]
            })
            res.send({
                clientSecret: paymentIntent.client_secret,
            });
        })
        app.post('/reports', async (req, res) => {
            const reportedBook = req.body;
            const result = await reportsCollection.insertOne(reportedBook);
            res.send(result);
        })
        app.post('/users', async (req, res) => {
            const user = req.body;
            const result = await usersCollection.insertOne(user);
            res.send(result);
        })
        app.post('/books', verifyToken, verifyseler, async (req, res) => {
            const book = req.body;
            const result = await booksCollection.insertOne(book)
            res.send(result);
        })
        app.post('/bookings', verifyToken, async (req, res) => {
            const booking = req.body;
            const result = await bookingsCollection.insertOne(booking);
            const id = req.query.bookId;
            const filter = {
                _id: ObjectId(id)
            }
            const updatedDoc = {
                $set: {
                    sold: true
                }
            }
            const updateResult = await booksCollection.updateOne(filter, updatedDoc,);
            res.send(result);
        })
        app.post('/verifyselerreq', verifyToken, verifyseler, async (req, res) => {
            const user = req.body;
            const result = await selervarificationsCollection.insertOne(user);
            res.send(result);
        })
        app.post('/transaction', verifyToken, async (req, res) => {
            const payment = req.body;
            const result = await paymentsCollection.insertOne(payment);
            const orderid = payment.orderId;
            const filter = { _id: ObjectId(orderid) };
            const option = { upsert: true };
            const updatedDoc = {
                $set: {
                    paid: true
                }
            }
            await bookingsCollection.updateOne(filter, updatedDoc, option);
            res.send(result);
        })
        // all get methods down below
        app.get('/categories', async (req, res) => {
            const query = {};
            const categories = await categoriesCollection.find(query).toArray();
            res.send(categories);
        })
        app.get('/jwt', async (req, res) => {
            const email = req.query.email;
            const query = { email };
            const user = await usersCollection.findOne(query);
            if (user) {
                const token = jwt.sign({ email }, process.env.ACCESS_TOKEN, { expiresIn: '15d' });
                res.send({ accessToken: token });
            }
            else {
                res.status(403).send({ message: 'Forbidden Access' })
            }
        })
        app.get('/slers', verifyToken, async (req, res) => {
            const query = { role: "Seler" };
            const allSeler = await usersCollection.find(query).toArray();
            res.send(allSeler);
        })
        app.get('/buyers', verifyToken, async (req, res) => {
            const query = { role: "Buyer" };
            const allBuyers = await usersCollection.find(query).toArray();
            res.send(allBuyers);
        })
        app.get('/users/admin', async (req, res) => {
            const email = req.query.email;
            const query = { email };
            const user = await usersCollection.findOne(query);
            res.send({ isAdmin: user?.role === "admin" });
        })
        app.get('/users/Buyer', async (req, res) => {
            const email = req.query.email;
            const query = { email };
            const user = await usersCollection.findOne(query);
            res.send({ isBuyer: user?.role === "Buyer" });
        })
        app.get('/users/varifyed', async (req, res) => {
            const email = req.query.email;
            const query = { email };
            const user = await usersCollection.findOne(query);
            res.send({ isVerified: user?.varify === true });
        })
        app.get('/users/seler', async (req, res) => {
            const email = req.query.email;
            const query = { email };
            const user = await usersCollection.findOne(query);
            res.send({ isSeler: user?.role === "Seler" });
        })
        app.get('/books/:id', async (req, res) => {
            const categoryId = req.params.id;
            const query = { categoryId, sold: false };
            const books = await booksCollection.find(query).toArray()
            res.send(books);
        })
        app.get('/mybooks', verifyToken, async (req, res) => {
            const email = req.query.email;
            const query = { selerEmail: email };
            const myBooks = await booksCollection.find(query).toArray()
            res.send(myBooks);
        })
        app.get('/myorders', verifyToken, async (req, res) => {
            const email = req.query.email;
            const query = { email };
            const myorders = await bookingsCollection.find(query).toArray();
            res.send(myorders);
        })
        app.get('/myorders/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const result = await bookingsCollection.findOne(query);
            res.send(result);
        })
        app.get('/advertised', async (req, res) => {
            const query = { advertise: true, sold: false };
            const result = await booksCollection.find(query).toArray();
            res.send(result);
        })
        app.get('/verifyselerreq', verifyToken, verifyAdmin, async (req, res) => {
            const query = { varify: false };
            const result = await selervarificationsCollection.find(query).toArray();
            res.send(result);
        })
        app.get('/reports', verifyToken, verifyAdmin, async (req, res) => {
            const query = { deleted: false };
            const result = await reportsCollection.find(query).toArray();
            res.send(result);
        })
        // all put methods are down below
        app.put('/books/:id', verifyToken, async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const option = { upsert: true };
            const updatedDoc = {
                $set: {
                    advertise: true
                }
            }
            const result = await booksCollection.updateOne(query, updatedDoc, option);
            res.send(result);
        })
        app.put('/verifyselerreq', verifyToken, verifyAdmin, async (req, res) => {
            const email = req.query.email;
            const query = { email };
            const option = { upsert: true };
            const updatedDoc = {
                $set: {
                    varify: true
                }
            }
            await selervarificationsCollection.updateOne(query, updatedDoc, option);
            const user = await usersCollection.updateOne(query, updatedDoc, option);
            res.send(user);
        })
        app.put('/reports', verifyToken, verifyAdmin, async (req, res) => {
            const reporteItem = req.body;
            const query = { _id: ObjectId(reporteItem.bookId) };
            await booksCollection.deleteOne(query);
            const filter = { _id: ObjectId(reporteItem._id) };
            const option = { upsert: true };
            const updatedDoc = {
                $set: {
                    deleted: true
                }
            }
            const result = await reportsCollection.updateOne(filter, updatedDoc, option);
            res.send(result);
        })
        app.put('/users/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: ObjectId(id) };
            const option = { upsert: true };
            const updatedDoc = {
                $set: {
                    varify: true
                }
            }
            const result = await usersCollection.updateOne(filter, updatedDoc, option);
            res.send(result);
        })
        // delete methods are here
        app.delete('/users/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const result = await usersCollection.deleteOne(query);
            res.send(result);
        })
        app.delete('/mybooks/:id', verifyToken, verifyseler, async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const result = await booksCollection.deleteOne(query);
            res.send(result);
        })

    }
    finally {

    }

}
run().catch(console.log)



app.get('/', (req, res) => {
    res.send('Bookly server is running!!');
});

app.listen(port, () => {
    console.log(`server is running on port : ${port}`);
})