import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ClientPortalService } from './client-portal.service';
import { ClientController } from './client.controller';
import { ClientStatus } from './client.entity';
import { ClientService } from './client.service';

describe('ClientController', () => {
  let controller: ClientController;
  const clientPortal = { getOverview: jest.fn(), reportPayment: jest.fn() };
  const clientService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    findForUser: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ClientController],
      providers: [
        { provide: ClientService, useValue: clientService },
        { provide: ClientPortalService, useValue: clientPortal },
        { provide: JwtService, useValue: {} },
      ],
    }).compile();

    controller = module.get(ClientController);
  });

  it('passes each request to the service, as the signed-in user', async () => {
    const request = { headers: {}, user: { sub: 'user-id' } };

    await controller.create(request, { email: 'user@example.com' });
    await controller.findAll(request, { limit: 20, offset: 40 });
    await controller.findOne(request, 'client-id');
    await controller.getMine(request);
    await controller.getMyOverview(request);
    await controller.update(request, 'client-id', {
      status: ClientStatus.Inactive,
    });
    await controller.remove(request, 'client-id');
    await controller.reportPayment(request, 'invoice-id', { reference: 'r' });

    expect(clientService.create).toHaveBeenCalledWith('user-id', {
      email: 'user@example.com',
    });
    expect(clientService.findAll).toHaveBeenCalledWith('user-id', {
      limit: 20,
      offset: 40,
    });
    expect(clientService.findOne).toHaveBeenCalledWith('user-id', 'client-id');
    expect(clientService.findForUser).toHaveBeenCalledWith('user-id');
    expect(clientPortal.getOverview).toHaveBeenCalledWith('user-id');
    expect(clientService.update).toHaveBeenCalledWith('user-id', 'client-id', {
      status: ClientStatus.Inactive,
    });
    expect(clientService.remove).toHaveBeenCalledWith('user-id', 'client-id');
    expect(clientPortal.reportPayment).toHaveBeenCalledWith(
      'user-id',
      'invoice-id',
      { reference: 'r' },
    );
  });
});
