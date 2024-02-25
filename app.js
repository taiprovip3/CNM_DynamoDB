require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const AWS = require('aws-sdk');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(cors());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.set('view engine', 'ejs');
app.set('views', __dirname + '/views');
const upload = multer();

// Cấu hình AWS
AWS.config.update({
    region: 'ap-southeast-1',
    accessKeyId: 'fakeAccessKeyId',
    secretAccessKey: 'fakeSecretAccessKey',
    endpoint: 'http://localhost:8000',
});

// Khởi tạo bảng dynamodb
const docClient = new AWS.DynamoDB.DocumentClient();
const dynamodb = new AWS.DynamoDB();
const tableName = 'Products';
const attributeDefinitions = [{AttributeName: 'maSP', AttributeType: 'S'}];
const createTableParams = {
    AttributeDefinitions: attributeDefinitions,
    KeySchema: [{AttributeName: 'maSP', KeyType: 'HASH'}],
    ProvisionedThroughput: {
        ReadCapacityUnits: 5,
        WriteCapacityUnits: 5,
    },
    TableName: tableName,
};
dynamodb.describeTable({ TableName: tableName }, (err, data) => {
    if(err && err.code === 'ResourceNotFoundException') {
        dynamodb.createTable(createTableParams, (err, data) => {
            if(err) {
                console.error('Unable to create table');
            } else {
                console.log('Created table');
                const maSP = uuidv4();
                const putItemParams = {
                    TableName: tableName,
                    Item: {
                      'maSP': { S: maSP },
                      'tenSP': { S: 'Nồi Cơm Điện Sunhouse' },
                      'soLuong': { N: '10' },
                      'donGia': { N: '8850000' }
                    }
                };
                dynamodb.putItem(putItemParams, (err, data) => {
                    if (err) {
                      console.error('Unable to add item. Error JSON:', JSON.stringify(err, null, 2));
                    } else {
                      console.log('Added item. Item description JSON:', JSON.stringify(data, null, 2));
                    }
                });
            }
        });
    } else {
        if (err) {
            console.error('Error describing table.');
        } else {
            console.log('Table already exists.');
        }
    }
});

// dynamodb.deleteTable({TableName: tableName}, (err, data) => {
//     if (err) {
//       console.error('Unable to delete table. Error JSON:', JSON.stringify(err, null, 2));
//     } else {
//       console.log('Deleted table. Table description JSON:', JSON.stringify(data, null, 2));
//     }
// });

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

app.get('/', async(req, res) => {
    try {
        const params = { TableName: tableName };
        const data = await docClient.scan(params).promise();
        return res.render('index.ejs', { items: data.Items });
    } catch (error) {
        console.error('Error retrieving data from DynamoDB:', error);
        return res.status(500).send('Internal Server Error');
    }
});

app.get('/add', async(req, res) => {
    return res.render('add.ejs');
});

app.post('/add', async (req, res) => {
    try {
        const { tenSP, donGia, soLuong } = req.body;
        const maSP = uuidv4();
        const params = {
            TableName: tableName,
            Item: {
                maSP,
                tenSP,
                soLuong,
                donGia,
            }
        };
        await docClient.put(params).promise();
    } catch (error) {
        console.error('Error putting data from DynamoDB:', error);
        return res.status(500).send('Internal Server Error');
    }
    return res.redirect('/');
});

app.post('/delete', async (req, res) => {
    try {
        const maSPList = Object.keys(req.body);
        if (!maSPList || maSPList.length === 0) {
            return res.status(400).json({ error: 'Invalid request body' });
        }

        function deleteItemsRecursive(index) {
            const params = {
                TableName: tableName,
                Key: {
                    'maSP': maSPList[index]
                }
            }
            docClient.delete(params, (err, data) => {
                if(err) {
                    console.error('error=', err);
                    return res.send('Interal Server Error!');
                } else
                    if(index > 0)
                        deleteItemsRecursive(index - 1);
                    else
                        return res.redirect('/');
            });
        }

        deleteItemsRecursive(maSPList.length - 1);
    } catch (error) {
        console.error('Error deleting data from DynamoDB:', error);
        return res.status(500).send('Internal Server Error');
    }
});