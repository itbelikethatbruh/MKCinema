from PIL import Image, ImageFilter
import numpy as np, sys
im=Image.open('kit/src.jpg').convert('RGB'); a=np.asarray(im).astype(float)
bg=np.array([21.5,21.7,23.7])
d=np.sqrt(((a-bg)**2).sum(2))
cand=d<9
reg=np.zeros_like(cand); reg[0,:]=cand[0,:];reg[-1,:]=False;reg[:,0]=cand[:,0];reg[:,-1]=cand[:,-1];reg[0,:]=cand[0,:]
# bottom edge: character touches it; seed only bottom pixels that are bg-like too
reg[-1,:]=cand[-1,:]
while True:
    n=reg.copy(); n[1:]|=reg[:-1]; n[:-1]|=reg[1:]; n[:,1:]|=reg[:,:-1]; n[:,:-1]|=reg[:,1:]; n&=cand
    if (n==reg).all(): break
    reg=n
# enclosed pockets of background between hair strands: big connected bg-like blobs that are mostly pure bg colour
from collections import deque
pocket=cand&~reg; H,W=pocket.shape; seen=np.zeros_like(pocket)
ys,xs=np.nonzero(pocket); added=0
for y0,x0 in zip(ys,xs):
    if seen[y0,x0]: continue
    q=deque([(y0,x0)]); seen[y0,x0]=True; comp=[]
    while q:
        y,x=q.popleft(); comp.append((y,x))
        for yy,xx in ((y+1,x),(y-1,x),(y,x+1),(y,x-1)):
            if 0<=yy<H and 0<=xx<W and pocket[yy,xx] and not seen[yy,xx]: seen[yy,xx]=True; q.append((yy,xx))
    if len(comp)>=120:
        cy,cx=zip(*comp); pure=(d[list(cy),list(cx)]<4.5).mean()
        if pure>.6: reg[list(cy),list(cx)]=True; added+=len(comp)
print('pockets added',added)
# remove tiny islands of fg inside bg? keep. alpha: 0 in reg; ramp near the region border
m=Image.fromarray((~reg*255).astype(np.uint8))
# edge band = fg pixels within 2px of bg
near=np.asarray(m.filter(ImageFilter.MinFilter(5)))<128
alpha=np.where(reg,0.0,1.0)
band=(~reg)&near
alpha[band]=np.clip((d[band]-6)/22,0,1)
alpha=np.asarray(Image.fromarray((alpha*255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.6))).astype(float)/255
alpha[reg & ~np.asarray(Image.fromarray(band.astype(np.uint8)*255).filter(ImageFilter.MaxFilter(3))).astype(bool)]=0
# decontaminate colour
A=np.clip(alpha,1e-3,1)[...,None]
c=np.clip((a-(1-A)*bg)/A,0,255)
out=np.dstack([c,alpha*255]).astype(np.uint8)
o=Image.fromarray(out,'RGBA'); bb=o.getbbox(); print('bbox',bb); bb=(bb[0],bb[1],min(bb[2],800),bb[3]); o=o.crop(bb)
o.save('kit/cut.png'); 
for col,name in [((200,30,90),'pink'),((240,240,240),'white')]:
    t=Image.new('RGBA',o.size,col+(255,)); t.alpha_composite(o); t.convert('RGB').save(f'kit/test-{name}.jpg')
