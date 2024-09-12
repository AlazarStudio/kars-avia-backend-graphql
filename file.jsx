import React, { useState } from 'react';

const UploadFile = () => {
  const [file, setFile] = useState(null);

  const handleFileChange = (event) => {
    setFile(event.target.files[0]);
  };

  const handleUpload = async () => {
    const formData = new FormData();
    formData.append('operations', JSON.stringify({
      query: `
        mutation($file: Upload!) {
          singleUpload(file: $file) {
            filename
            mimetype
            encoding
          }
        }
      `,
      variables: {
        file: null
      }
    }));

    // Map the file to the variable `$file`
    formData.append('map', JSON.stringify({
      "0": ["variables.file"]
    }));

    // Append the file itself
    formData.append('0', file);

    try {
      const response = await fetch('http://localhost:4000/graphql', {
        method: 'POST',
        headers: {
          'Apollo-Require-Preflight': 'true'
        },
        body: formData
      });

      const result = await response.json();
      console.log(result);
    } catch (error) {
      console.error('Error uploading file:', error);
    }
  };

  return (
    <div>
      <input type="file" onChange={handleFileChange} />
      <button onClick={handleUpload}>Upload</button>
    </div>
  );
};

export default UploadFile;
