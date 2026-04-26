import { api } from "./api";

export const getAllFilesAPI = async (refreshDB) => {
  try {
    // const response = await api.get(`${refreshDB ? '?refreshDB=1' : ''}`);
    const response = await api.get();
    return response;
  } catch (error) {
    return error;
  }
};
