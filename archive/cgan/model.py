"""Experimental text-conditioned U-Net/PatchGAN, not pretrained fashion weights."""
import torch
from torch import nn
from torch.nn import functional as F

class ConditionedBlock(nn.Module):
    def __init__(self, incoming, outgoing, condition_dim):
        super().__init__()
        self.conv = nn.Conv2d(incoming,outgoing,3,padding=1)
        self.norm = nn.GroupNorm(8,outgoing,affine=False)
        self.affine = nn.Linear(condition_dim,outgoing*2)

    def forward(self,x,condition):
        scale,bias = self.affine(condition).chunk(2,dim=1)
        x = self.norm(self.conv(x))
        return F.leaky_relu(x*(1+scale[:,:,None,None])+bias[:,:,None,None],.2)

class Generator(nn.Module):
    def __init__(self,text_dim=512,noise_dim=32,base=32):
        super().__init__()
        self.noise_dim = noise_dim
        condition = text_dim+noise_dim
        channels = [base,base*2,base*4,base*8]
        self.down = nn.ModuleList([ConditionedBlock(4,channels[0],condition)] +
            [ConditionedBlock(channels[i-1],channels[i],condition) for i in range(1,4)])
        self.up = nn.ModuleList([ConditionedBlock(channels[i]+channels[i-1],channels[i-1],condition) for i in (3,2,1)])
        self.output = nn.Conv2d(base,3,3,padding=1)
        # Start close to the source photograph instead of reconstructing every
        # fabric pixel from random RGB output. The network learns an edit delta.
        nn.init.normal_(self.output.weight,mean=0,std=.001)
        nn.init.zeros_(self.output.bias)

    def forward(self,source,mask,text,noise):
        condition = torch.cat((text,noise),1)
        x = torch.cat((source,mask),1)
        skips = []
        for i,block in enumerate(self.down):
            if i: x = F.avg_pool2d(x,2)
            x = block(x,condition)
            skips.append(x)
        for block,skip in zip(self.up,reversed(skips[:-1])):
            x = F.interpolate(x,size=skip.shape[-2:],mode="bilinear",align_corners=False)
            x = block(torch.cat((x,skip),1),condition)
        generated = (source + 2*torch.tanh(self.output(x))).clamp(-1,1)
        return source*(1-mask)+generated*mask

class Discriminator(nn.Module):
    def __init__(self,text_dim=512,base=32):
        super().__init__()
        self.text = nn.Linear(text_dim,16)
        layers = []
        incoming = 3+3+1+16
        for outgoing in (base,base*2,base*4):
            layers.extend([nn.Conv2d(incoming,outgoing,4,stride=2,padding=1),nn.LeakyReLU(.2)])
            incoming = outgoing
        layers.append(nn.Conv2d(incoming,1,3,padding=1))
        self.net = nn.Sequential(*layers)

    def forward(self,source,candidate,mask,text):
        condition = self.text(text)[:,:,None,None].expand(-1,-1,*source.shape[-2:])
        return self.net(torch.cat((source,candidate,mask,condition),1))

def masked_l1(output,target,mask):
    return ((output-target).abs()*mask).sum()/(mask.sum()*output.shape[1]).clamp_min(1)
