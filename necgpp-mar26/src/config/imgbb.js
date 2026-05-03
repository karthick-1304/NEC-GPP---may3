import axios from 'axios';
import FormData from 'form-data';

const uploadToImgBB = async (fileBuffer, fileName) => {
  const base64Image = fileBuffer.toString('base64');

  const form = new FormData();
  form.append('key', process.env.IMGBB_API_KEY);   // key in body (not just query)
  form.append('image', base64Image);                // base64 as per docs
  form.append('name', fileName);                    // optional but good practice

  const { data } = await axios.post(
    'https://api.imgbb.com/1/upload',
    form,
    { headers: form.getHeaders() }
  );

  // Full response mapping from imgBB JSON structure
  return {
    // Image URLs
    url:         data.data.url,          // full image URL
    display_url: data.data.display_url,  // display version
    thumb_url:   data.data.thumb.url,    // thumbnail URL

    // IDs
    id:          data.data.id,
    public_id:   data.data.image.filename,

    // Metadata
    size:        data.data.size,
    width:       data.data.width,
    height:      data.data.height,
    mime:        data.data.image.mime,
    extension:   data.data.image.extension,

    // Delete
    delete_url:  data.data.delete_url,
  };
};

export { uploadToImgBB };