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
const storage = multer.memoryStorage({
    destination(req, file, callback) {
        callback(null, '');
    },
});
const upload = multer({
    storage,
    limits: {fileSize: 2000000}, // 2MB
    fileFilter(req, file, cb) {
        checkFileType(file, cb);
    },
});

// Cấu hình AWS
AWS.config.update({
    region: process.env.REGION,
    accessKeyId: process.env.ACCESS_KEY_ID,
    secretAccessKey: process.env.SECRET_ACCESS_KEY,
    // endpoint: 'http://localhost:8000',
});

// Khởi tạo bảng dynamodb, s3
const s3 = new AWS.S3();
const docClient = new AWS.DynamoDB.DocumentClient();
const dynamodb = new AWS.DynamoDB();
const tableName = 'Products';
// const attributeDefinitions = [{AttributeName: 'maSP', AttributeType: 'S'}];
// const createTableParams = {
//     AttributeDefinitions: attributeDefinitions,
//     KeySchema: [{AttributeName: 'maSP', KeyType: 'HASH'}],
//     ProvisionedThroughput: {
//         ReadCapacityUnits: 5,
//         WriteCapacityUnits: 5,
//     },
//     TableName: tableName,
// };
// dynamodb.describeTable({ TableName: tableName }, (err, data) => {
//     if(err && err.code === 'ResourceNotFoundException') {
//         dynamodb.createTable(createTableParams, (err, data) => {
//             if(err) {
//                 console.error('Unable to create table');
//             } else {
//                 console.log('Created table');
//                 const maSP = uuidv4();
//                 const putItemParams = {
//                     TableName: tableName,
//                     Item: {
//                       'maSP': { S: maSP },
//                       'tenSP': { S: 'Nồi Cơm Điện Sunhouse' },
//                       'soLuong': { N: '10' },
//                       'donGia': { N: '8850000' },
//                       'image': { S: 'https://phantantai-s3.s3.ap-southeast-1.amazonaws.com/IMG_2190.JPG' },
//                     }
//                 };
//                 dynamodb.putItem(putItemParams, (err, data) => {
//                     if (err) {
//                       console.error('Unable to add item. Error JSON:', JSON.stringify(err, null, 2));
//                     } else {
//                       console.log('Added item. Item description JSON:', JSON.stringify(data, null, 2));
//                     }
//                 });
//             }
//         });
//     } else {
//         if (err) {
//             console.error('Error describing table.');
//         } else {
//             console.log('Table already exists.');
//         }
//     }
// });

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

app.post('/add', upload.single('image'), (req, res) => {
    try {
        const { tenSP, donGia, soLuong } = req.body;
        const image = req.file.originalname.split('.');
        const fileType = image[image.length-1];
        const maSP = uuidv4();
        const filePath = `${maSP + Date.now().toString()}.${fileType}`;
        console.log('filePath=', filePath);
        const paramsS3 = {
            Bucket: 'phantantai-s3',
            Key: filePath,
            Body: req.file.buffer,
            ContentType: req.file.mimetype,
        }
        s3.upload(paramsS3, async (err, data) => {
            if(err) {
                console.error('error=', err);
                return res.send('Internal server error!');
            } else {



                const params = {
                    TableName: tableName,
                    Item: {
                        maSP,
                        tenSP,
                        soLuong,
                        donGia,
                        image: `https://${process.env.S3_BUCKET_NAME}.s3.${process.env.REGION}.amazonaws.com/${filePath}`,
                    }
                };
                await docClient.put(params).promise();
                return res.redirect('/');



            }
        });
    } catch (error) {
        console.error('Error putting data from DynamoDB:', error);
        return res.status(500).send('Internal Server Error');
    }
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

function checkFileType(file, cb) {
    const fileTypes = /jpeg|jpg|png|gif/;

    const extname = fileTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = fileTypes.test(file.mimetype);
    if(extname && mimetype) {
        return cb(null, true);
    }
    return cb('Error: Image Only Pls!');
}