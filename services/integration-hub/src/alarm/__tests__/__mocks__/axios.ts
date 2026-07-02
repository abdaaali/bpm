const axios: any = jest.fn().mockResolvedValue({ status: 200, data: {} });
axios.get  = jest.fn().mockResolvedValue({ status: 200, data: {} });
axios.post = jest.fn().mockResolvedValue({ status: 200, data: {} });
axios.patch = jest.fn().mockResolvedValue({ status: 200, data: {} });
export default axios;
export const { get, post, patch } = axios;
