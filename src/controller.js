import puppeteer from 'puppeteer';
import vision from '@google-cloud/vision';
import axios from 'axios';
import re from 're';  // Import regex module
import { fileURLToPath } from 'url';
import { dirname, join } from 'path'; // Import both dirname and join from 'path'
import dotenv from 'dotenv'; // Assuming you're using dotenv to load environment variables
import AWS from 'aws-sdk'; // Assuming you're using dotenv to load environment variables

const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,  // Set your AWS access key
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,  // Set your AWS secret key
  region: process.env.AWS_REGION  // Set your AWS region
});


// Load environment variables from .env file
dotenv.config();

// Get __filename and __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Construct dynamic path to the credentials file
const credentialsPath = join(__dirname, process.env.GOOGLE_APPLICATION_CREDENTIALS);

// Set the environment variable for Google Application Credentials
process.env.GOOGLE_APPLICATION_CREDENTIALS = credentialsPath;


// Controller for GET request
export const getData = (req, res) => {
  res.json({ message: 'GET request successful!' });
};

// Controller for creating item
export const trackConsignment = async (req, res) => {
  const { consignment_number } = req.body;

  if (!consignment_number) {
    console.error('Missing consignment number');
    return res.status(400).json({ error: 'Missing consignment number' });
  }

  try {
    const trackingInfo = await mainWorkflow(consignment_number, false);
    res.json({ message: 'Tracking info retrieved', data: trackingInfo });
  } catch (error) {
    console.error('Error in trackConsignment:', error);
    res.status(500).json({ error: error.message });
  }
};


// Function to extract text from captcha using Google Vision API
const extractTextFromCaptcha = async (captchaUrl) => {
  try {
    const client = new vision.ImageAnnotatorClient();

    // Fetch the captcha image from the URL
    const response = await axios.get(captchaUrl, { responseType: 'arraybuffer' });

    if (response.status === 200) {
      const imageContent = response.data;

      // Prepare image for text detection
      const request = {
        image: { content: Buffer.from(imageContent).toString('base64') },
      };

      // Call the Google Cloud Vision API to detect text in the captcha image
      const [result] = await client.textDetection(request);
      const detections = result.textAnnotations;

      if (detections.length > 0) {
        const captchaText = detections[0].description;
        // console.log('Extracted text from Captcha:', captchaText);
        return captchaText;
      } else {
        console.log('No text detected in the captcha.');
      }
    } else {
      console.log('Failed to fetch the captcha image.');
    }
  } catch (error) {
    console.error('Error extracting text from captcha:', error.message);
  }

  return null;
};


// API endpoint to extract text from captcha
export const extractCaptcha = async (req, res) => {
  const { captchaUrl } = req.body;

  if (!captchaUrl) {
    return res.status(400).json({ error: 'Captcha URL is required' });
  }

  try {
    const captchaText = await extractTextFromCaptcha(captchaUrl);

    if (captchaText) {
      return res.json({ success: true, captchaText });
    } else {
      return res.status(404).json({ success: false, message: 'No text detected in captcha' });
    }
  } catch (error) {
    console.error('Error in API:', error.message);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};


// Function to launch browser
const launchBrowser = async (headless = true) => {
  return puppeteer.launch({
    headless,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-gpu',
      '--disable-extensions',
      '--disable-popup-blocking',
      '--disable-dev-shm-usage',
    ],
  });
};


// Function to process the captcha text based on the query
const processOutputBasedOnQuery = (text, query) => {
  let coutput = "";

  if (query.includes('number')) {
    // Extract numbers using regex
    let numbers = text.match(/\d+/g);

    // If only one large number is extracted, split it into individual digits
    if (numbers && numbers.length === 1 && numbers[0].length > 1) {
      numbers = [...numbers[0]];  // Split the string into individual digits
    }

    console.log("All numbers extracted:", numbers);

    // Mapping for number position (e.g., 'First', 'Second', 'Third', etc.)
    const numberWords = { 'First': 0, 'Second': 1, 'Third': 2, 'Fourth': 3, 'Fifth': 4, 'Sixth': 5 };

    // Extract the position word from the query (e.g., 'Third' from 'Enter the Third number')
    const positionWord = query.split(' ')[2];  // Correctly split the query by space and access the 3rd word

    const numberIndex = numberWords[positionWord];

    if (numberIndex !== undefined && numbers.length > numberIndex) {
      console.log(`${positionWord} number:`, numbers[numberIndex]);
      coutput = numbers[numberIndex];
    } else {
      console.log(`${positionWord} number: Not found`);
    }
  } else if (query.includes('Expression')) {
    try {
      // Remove non-mathematical characters and evaluate the expression
      const sanitizedText = text.replace(/[^\d\+\-\*/]/g, '');
      const result = eval(sanitizedText);
      console.log("Evaluated result:", result);
      coutput = result;
    } catch (error) {
      console.log("Error evaluating expression:", error.message);
    }
  } else {
    console.log("Extracted Text:", text);
    coutput = text;
  }

  return coutput;
};

// Function to handle captcha and fill form based on query type
const handleCaptchaAndFillForm = async (page) => {
  const captchaSelectors = [
    '#ctl00_PlaceHolderMain_ucNewLegacyControl_ucCaptcha1_imgCaptcha',
    '#ctl00_PlaceHolderMain_ucNewLegacyControl_ucCaptcha1_imgMathCaptcha',
  ];

  for (let selector of captchaSelectors) {
    const captchaElement = await page.$(selector);
    if (captchaElement) {
      const captchaUrl = await page.evaluate(el => el.src, captchaElement);
      console.log('Captcha URL:', captchaUrl);

      // Make API call to extract captcha text
      try {
        const response = await axios.post(`${process.env.BACKEND_URL}/extractCaptchaText`, { captchaUrl });
        if (response.data.success && response.data.captchaText) {
          const captchaText = response.data.captchaText;
          console.log('Extracted Captcha Text from API:', captchaText);

          // Get the query type from the webpage
          const queryElement = await page.$('#ctl00_PlaceHolderMain_ucNewLegacyControl_ucCaptcha1_lblCaptcha');
          const queryText = await page.evaluate(el => el.textContent, queryElement);
          console.log('Query:', queryText);

          // Process the captcha text based on the query
          const processedCaptchaText = processOutputBasedOnQuery(captchaText, queryText);

          if (processedCaptchaText) {
            await page.type('#ctl00_PlaceHolderMain_ucNewLegacyControl_ucCaptcha1_txtCaptcha', processedCaptchaText.toString().trim());
            return true;
          }
        } else {
          console.log('Failed to extract captcha text from API.');
        }
      } catch (error) {
        console.error('Error calling captcha extraction API:', error.message);
      }
    }
  }

  console.log('Captcha element not found');
  return false;
};



// Function to submit the form after filling captcha
const submitForm = async (page) => {
  await page.click('#ctl00_PlaceHolderMain_ucNewLegacyControl_btnSearch');
  await page.waitForSelector('div.col-xs-12.col-md-12');  // Adjust selector based on the result page
  console.log('Form submitted and result page loaded');
};

// Function to retrieve tracking info
const retrieveTrackingInfo = async (page, consignmentNumber) => {
  try {
    // Wait for the tracking status to be visible
    await page.waitForSelector('#ctl00_PlaceHolderMain_ucNewLegacyControl_lblMailArticleCurrentStatusOER', { timeout: 60000 });

    // Get the current status text
    const trackingStatus = await page.$eval('#ctl00_PlaceHolderMain_ucNewLegacyControl_lblMailArticleCurrentStatusOER', el => el.textContent.trim());

    // Get the full HTML content of the tracking div
    let trackingDivHtml = await page.$eval('#ctl00_PlaceHolderMain_ucNewLegacyControl_upnlTrackConsignment', el => el.outerHTML);

    // Remove only unnecessary characters like \n, \t, and \r
    trackingDivHtml = trackingDivHtml.replace(/[\n\t\r]+/g, '');

    // Create a PDF of the current page (Ctrl + P equivalent) as a buffer
    const pdfBuffer = await page.pdf({
      format: 'A4',  // Set paper size
      printBackground: true,  // Print background colors
    });

    // Upload the PDF buffer to S3
    const s3Params = {
      Bucket: process.env.AWS_S3_BUCKET_NAME,  // Your S3 bucket name
      Key: `consignment_${consignmentNumber}.pdf`,  // File name in S3
      Body: pdfBuffer,  // The PDF buffer generated by Puppeteer
      ContentType: 'application/pdf',  // Specify the file type
      // ACL: 'public-read'  // Set access control (optional)
    };

    const uploadResult = await s3.upload(s3Params).promise();
    console.log('PDF uploaded to S3:', uploadResult.Location);

    // Return an object with consignment number, tracking status, full HTML content, and S3 URL
    return {
      "Consignment Number": consignmentNumber,
      "Current Status": trackingStatus,
      "HTML Content": trackingDivHtml,
      "PDF URL": uploadResult.Location  // The S3 URL of the uploaded PDF
    };

  } catch (error) {
    console.error('Error retrieving tracking info:', error.message);

    // Return a structured object in case of error
    return {
      "Consignment Number": consignmentNumber,
      "Current Status": "Tracking info not found or captcha failed.",
      "HTML Content": null
    };
  }
};


// Main workflow function
const mainWorkflow = async (consignmentNumber, headless = true) => {
  const browser = await launchBrowser(headless);

  try {
    const page = await browser.newPage();
    await page.setDefaultNavigationTimeout(60000); // Set default navigation timeout to 60 seconds

    await page.goto("https://www.indiapost.gov.in/_layouts/15/dop.portal.tracking/trackconsignment.aspx", {
      timeout: 60000,  // Increase timeout to 60 seconds
      waitUntil: 'networkidle2'  // Wait until the page has no more than 2 network connections
    });

    // Input consignment number
    await page.waitForSelector('#ctl00_PlaceHolderMain_ucNewLegacyControl_txtOrignlPgTranNo', { timeout: 20000 });
    await page.type('#ctl00_PlaceHolderMain_ucNewLegacyControl_txtOrignlPgTranNo', consignmentNumber);

    // Handle captcha and fill the form
    const captchaSuccess = await handleCaptchaAndFillForm(page);
    if (!captchaSuccess) {
      await browser.close();
      return 'Captcha ID not found or unable to extract text.';
    }

    // Submit form after filling captcha
    await submitForm(page);

    // Retrieve tracking information
    const trackingInfo = await retrieveTrackingInfo(page, consignmentNumber);

    await browser.close();
    return trackingInfo;
  } catch (error) {
    console.error('Error in mainWorkflow:', error);
    await browser.close();
    throw error;
  }
};


