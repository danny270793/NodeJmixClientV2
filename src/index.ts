import Axios, { AxiosResponse } from 'axios'
import FormData from 'form-data'
import Qs from 'node:querystring'
import Fs from 'node:fs'

export interface UploadedFile {
    fileRef: string
    name: string
    size: number
}

export interface LoginResponse {
    access_token: string
    token_type: string
    expires_in: number
}

export interface BaseEntity {
    _entityName: string
    _instanceName: string
    id: string
}

export interface Condition {
    property: string
    operator: string
    value: string
}

export default class JmixClient {
    protocol: string
    hostname: string
    port: string
    clientId: string
    clientSecret: string
    basicAuth: string
    oauthToken: string | undefined
    constructor(
        protocol: string,
        hostname: string,
        port: string,
        clientId: string,
        clientSecret: string,
    ) {
        this.protocol = protocol
        this.hostname = hostname
        this.port = port
        this.clientId = clientId
        this.clientSecret = clientSecret

        this.basicAuth = Buffer.from(
            `${this.clientId}:${this.clientSecret}`,
        ).toString('base64')
    }

    async login(): Promise<LoginResponse> {
        const response: AxiosResponse<LoginResponse> =
            await Axios<LoginResponse>({
                method: 'post',
                maxBodyLength: Infinity,
                url: `${this.protocol}://${this.hostname}:${this.port}/oauth2/token`,
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    Authorization: `Basic ${this.basicAuth}`,
                },
                data: Qs.stringify({
                    grant_type: 'client_credentials',
                }),
            })
        return response.data
    }

    async execute<T>(callback: Function, isRetry: boolean = false): Promise<T> {
        if (this.oauthToken === undefined) {
            const login: LoginResponse = await this.login()
            this.oauthToken = login.access_token
        }

        const response: AxiosResponse<T> = await callback().catch(async (error: any) => {
            if(isRetry === false) {
                if(error.response.headers['www-authenticate'].startsWith('Bearer error="invalid_token"')) {
                    this.oauthToken = undefined
                    return this.execute(callback, true)
                }
            }

            throw error
        })
        return response.data
    }

    async search<T extends BaseEntity>(
        name: string,
        conditions: Condition[],
    ): Promise<T[]> {
        return await this.execute(
            async () =>
                await Axios<T[]>({
                    method: 'post',
                    maxBodyLength: Infinity,
                    url: `${this.protocol}://${this.hostname}:${this.port}/rest/entities/${name}/search`,
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${this.oauthToken ?? ''}`,
                    },
                    data: {
                        filter: {
                            conditions,
                        },
                    },
                }),
        )
    }

    async read<T extends BaseEntity>(
        name: string,
        fetchPlan: string | undefined = undefined,
    ): Promise<T[]> {
        return await this.execute(
            async () =>
                await Axios<T[]>({
                    method: 'get',
                    maxBodyLength: Infinity,
                    url: `${this.protocol}://${this.hostname}:${
                        this.port
                    }/rest/entities/${name}?${
                        fetchPlan === undefined ? '' : `fetchPlan=${fetchPlan}`
                    }`,
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${this.oauthToken ?? ''}`,
                    },
                }),
        )
    }

    async create(name: string, data: any): Promise<any> {
        return await this.execute(
            async () =>
                await Axios({
                    method: 'post',
                    maxBodyLength: Infinity,
                    url: `${this.protocol}://${this.hostname}:${this.port}/rest/entities/${name}`,
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${this.oauthToken ?? ''}`,
                    },
                    data,
                }),
        )
    }

    async update(name: string, id: string, data: any): Promise<void> {
        const response: AxiosResponse = await this.execute(
            async () =>
                await Axios({
                    method: 'put',
                    maxBodyLength: Infinity,
                    url: `${this.protocol}://${this.hostname}:${this.port}/rest/entities/${name}/${id}`,
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${this.oauthToken ?? ''}`,
                    },
                    data,
                }),
        )
        return response.data
    }

    async delete(name: string, id: string): Promise<void> {
        const response: AxiosResponse = await this.execute(
            async () =>
                await Axios({
                    method: 'delete',
                    maxBodyLength: Infinity,
                    url: `${this.protocol}://${this.hostname}:${this.port}/rest/entities/${name}/${id}`,
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${this.oauthToken ?? ''}`,
                    },
                }),
        )
        return response.data
    }

    async getServices(name: string): Promise<void> {
        return await this.execute(
            async () =>
                await Axios({
                    method: 'get',
                    maxBodyLength: Infinity,
                    url: `${this.protocol}://${this.hostname}:${this.port}/rest/services/${name}`,
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${this.oauthToken ?? ''}`,
                    },
                }),
        )
    }

    async executeService(
        name: string,
        method: string,
        data: any,
    ): Promise<void> {
        return await this.execute(
            async () =>
                await Axios({
                    method: 'post',
                    maxBodyLength: Infinity,
                    url: `${this.protocol}://${this.hostname}:${this.port}/rest/services/${name}/${method}`,
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${this.oauthToken ?? ''}`,
                    },
                    data,
                }),
        )
    }

    async uploadFileFromPath(path: string): Promise<UploadedFile> {
        const formData: FormData = new FormData()
        const readStream: Fs.ReadStream = Fs.createReadStream(path)
        formData.append('file', readStream)

        return await this.execute<UploadedFile>(
            async () =>
                await Axios<UploadedFile>({
                    method: 'POST',
                    url: `${this.protocol}://${this.hostname}:${this.port}/rest/files`,
                    headers: {
                        Authorization: `Bearer ${this.oauthToken ?? ''}`,
                        ...formData.getHeaders(),
                    },
                    data: formData,
                }),
        )
    }
}
