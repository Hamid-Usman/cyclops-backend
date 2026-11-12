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

  it('passes each request to the service', async () => {
    await controller.create({ email: 'user@example.com' });
    await controller.findAll();
    await controller.findOne('client-id');
    await controller.getMine({ headers: {}, user: { sub: 'user-id' } });
    await controller.getMyOverview({ headers: {}, user: { sub: 'user-id' } });
    await controller.update('client-id', { status: ClientStatus.Inactive });
    await controller.remove('client-id');

    expect(clientService.create).toHaveBeenCalledWith({
      email: 'user@example.com',
    });
    expect(clientService.findAll).toHaveBeenCalled();
    expect(clientService.findOne).toHaveBeenCalledWith('client-id');
    expect(clientService.findForUser).toHaveBeenCalledWith('user-id');
    expect(clientPortal.getOverview).toHaveBeenCalledWith('user-id');

    const request = { headers: {}, user: { sub: 'user-id' } };
    await controller.reportPayment(request, 'invoice-id', { reference: 'r' });
    expect(clientPortal.reportPayment).toHaveBeenCalledWith(
      'user-id',
      'invoice-id',
      { reference: 'r' },
    );
    expect(clientService.update).toHaveBeenCalledWith('client-id', {
      status: ClientStatus.Inactive,
    });
    expect(clientService.remove).toHaveBeenCalledWith('client-id');
  });
});
