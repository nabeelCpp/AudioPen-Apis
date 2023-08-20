const fs = require("fs");
const multer = require("multer");
const { Configuration, OpenAIApi } = require("openai");
const projectPath = require("path");


const configuration = new Configuration({
    apiKey: process.env.OPEN_AI_KEY,
});
const openai = new OpenAIApi(configuration);
exports.index = async (req, res) => {
    try {
        console.log("Welcome to AssemblyAI!");
        // console.log(req.file)

        console.log('Saving file locally.')
        // Define the storage for multer
        const audioPath = projectPath.join(__dirname, "../../temp_audios");

        const storage =   multer.diskStorage({  
            destination:  (req, file, callback) => {  
              callback(null, audioPath);  
            },
            filename: (req, file, callback) => {
                file.originalname = `${Date.now()}-${file.originalname}`
              callback(null, file.originalname);  
            }
        });
        var upload = multer({ storage : storage}).single('audio');   
        upload(req,res,async (err) => {
            if(!req.file){
                return res.status(403).send({
                    message: "No audio file selected."
                })
            }else if(req.file.mimetype){
                const arr = req.file.mimetype.split('/');
                if(arr[0] !== 'audio'){
                    return res.status(203).send({
                        message: 'Invalid filetype. Only audios are allowed'
                    });
                }
            }
            if(err) {
                console.log(err)
                return res.status(500).send({
                    message: "Error uploading audio file."
                });  
            }
            const path = `${audioPath}/${req.file.originalname}`;
            const uploadUrl = await upload_file(process.env.ASSEMBLY_AI_TOKEN, path);
            if (!uploadUrl) {
                return res.status(500).send({
                    message: 'Upload failed. Please try again.'
                })
            }
            // Transcribe the audio file using the upload URL
            const transcript = await transcribeAudio(process.env.ASSEMBLY_AI_TOKEN, uploadUrl);
    
            console.log("Transcribed results: ", transcript.text)
    
            // Call chatgpt api to get summarization of text.
            let chatGptResponse = await chatGpt(transcript.text)

            // Remove the uplaoded audio file from our system.
            fs.unlink(path, (err) => {
                if(err && err.code == 'ENOENT') {
                    console.log("File doesn't exist");
                } else if (err) {
                    console.error("Error occurred while trying to remove file");
                } else {
                    console.info(`removed`);
                }
            });
            return res.send({
                message: chatGptResponse
            })
        });  
    } catch (error) {
        console.log(error)
        return res.status(500).send({
            message: 'Error! See the console logs for further details.'
        })
    }
}



// Function to upload a local file to the AssemblyAI API
const upload_file = async (api_token, path) => {
    console.log(`Uploading file: ${path}`);
  
    // Read the file data
    const data = fs.readFileSync(path);
    const url = "https://api.assemblyai.com/v2/upload";
  
    try {
      // Send a POST request to the API to upload the file, passing in the headers and the file data
      const response = await fetch(url, {
        method: "POST",
        body: data,
        headers: {
          "Content-Type": "application/octet-stream",
          Authorization: api_token,
        },
      });
  
      // If the response is successful, return the upload URL
      if (response.status === 200) {
        const responseData = await response.json();
        return responseData["upload_url"];
      } else {
        console.error(`Error: ${response.status} - ${response.statusText}`);
        return null;
      }
    } catch (error) {
      console.error(`Error: ${error}`);
      return null;
    }
}


// Async function that sends a request to the AssemblyAI transcription API and retrieves the transcript
const transcribeAudio = async (api_token, audio_url) => {
    console.log("Transcribing audio... This might take a moment.");
  
    // Set the headers for the request, including the API token and content type
    const headers = {
      authorization: api_token,
      "content-type": "application/json",
    };
  
    // Send a POST request to the transcription API with the audio URL in the request body
    const response = await fetch("https://api.assemblyai.com/v2/transcript", {
      method: "POST",
      body: JSON.stringify({ audio_url }),
      headers,
    });
  
    // Retrieve the ID of the transcript from the response data
    const responseData = await response.json();
    const transcriptId = responseData.id;
  
    // Construct the polling endpoint URL using the transcript ID
    const pollingEndpoint = `https://api.assemblyai.com/v2/transcript/${transcriptId}`;
  
    // Poll the transcription API until the transcript is ready
    while (true) {
      // Send a GET request to the polling endpoint to retrieve the status of the transcript
      const pollingResponse = await fetch(pollingEndpoint, { headers });
      const transcriptionResult = await pollingResponse.json();
  
      // If the transcription is complete, return the transcript object
      if (transcriptionResult.status === "completed") {
        return transcriptionResult;
      }
      // If the transcription has failed, throw an error with the error message
      else if (transcriptionResult.status === "error") {
        throw new Error(`Transcription failed: ${transcriptionResult.error}`);
      }
      // If the transcription is still in progress, wait for a few seconds before polling again
      else {
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    }
}

const chatGpt = async (text) => {
    try {
        const response = await openai.createCompletion({
            model: "text-davinci-003",
            prompt: `Summarize the following text:\\n${text}`,
            temperature: 0,
            max_tokens: 4500,
            top_p: 1,
            frequency_penalty: 0,
            presence_penalty: 0,
        });
        return response.choices[0].text.trim();
    } catch (error) {
        console.log('Chatgpt error: ', error.response.data)
        return text;
    }
}