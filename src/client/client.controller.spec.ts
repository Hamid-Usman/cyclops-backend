import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ClientController } from './client.controller';
import { ClientService } from './client.service';

describe('ClientController', () => {
  let controller: ClientController;
  const clientService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    findForUser: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ClientController],
      providers: [
        { provide: ClientService, useValue: clientService },
        { provide: JwtService, useValue: {} },
      ],
    }).compile();

    controller = module.get(ClientController);
  });

  it('passes each request to the service', async () => {
    await controller.create({ email: 'user@example.com' });
    await controller.findAll();
    await controller.findOne('client-id');
    await controller.getMine({ headers: {}, user: { sub: 'user-id' } });
    await controller.remove('client-id');

    expect(clientService.create).toHaveBeenCalledWith({
      email: 'user@example.com',
    });
    expect(clientService.findAll).toHaveBeenCalled();
    expect(clientService.findOne).toHaveBeenCalledWith('client-id');
    expect(clientService.findForUser).toHaveBeenCalledWith('user-id');
    expect(clientService.remove).toHaveBeenCalledWith('client-id');
  });
});
