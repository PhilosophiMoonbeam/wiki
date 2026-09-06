import fs from 'node:fs'
import { describe, expect, it, vi } from '../../../server/test/bun-test.mts'
const script=fs.readFileSync('client/components/admin/general-logo-manager.vue','utf8').match(/<script lang='ts'>([\s\S]*?)<\/script>/)![1]!
const compiled=new Bun.Transpiler({loader:'ts'}).transformSync(script.replace(/^import[\s\S]*?from ['"][^'"]+['"]\s*$/gm,'').replace('export default','const component ='))
const pending={active:{revisionId:'active',logoUrl:'/_site-logo/active/logo.png'},candidate:{revisionId:'next',status:'running',errorCode:null}}
function arrange(){
  const api={fetchSiteLogoStatus:vi.fn().mockResolvedValue(pending),uploadSiteLogo:vi.fn().mockResolvedValue(pending),retrySiteLogo:vi.fn().mockResolvedValue(pending)}
  const window={fetch:vi.fn(),setTimeout:vi.fn().mockReturnValue(1),clearTimeout:vi.fn()},URL={createObjectURL:vi.fn().mockReturnValue('blob:selected'),revokeObjectURL:vi.fn()},wikiStore={site:{logoUrl:'/legacy.svg'}}
  const deps={...api,window,URL,wikiStore,SiteLogoApiError:class extends Error{},SITE_LOGO_MAX_BYTES:5242880}
  const component=new Function(...Object.keys(deps),compiled+';return component')(...Object.values(deps)),state={...component.data(),disabled:false}
  for(const[key,fn]of Object.entries(component.methods))state[key]=(fn as (...args:unknown[])=>unknown).bind(state)
  for(const[key,fn]of Object.entries(component.computed))Object.defineProperty(state,key,{get:()=>(fn as()=>unknown).call(state)})
  return{component,state,api,window,URL,wikiStore}
}
const files=(...items:unknown[])=>({length:items.length,item:(index:number)=>items[index]??null})
describe('General logo publication',()=>{
  it('reviews one local image before submission and allows cancellation without a request',()=>{
    const{state,api,URL}=arrange(),file={name:'logo.png',size:2048,type:'application/octet-stream'};state.acceptLogoFiles(files(file));expect(state.confirming).toBe(true);expect(state.selectedFile).toBe(file);expect(api.uploadSiteLogo).not.toHaveBeenCalled();state.cancelSelection();expect(state.selectedFile).toBeNull();expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:selected');state.acceptLogoFiles(files(file,file));expect(state.logoErrorKey).toBe('admin:general.logoErrorOneFile');state.acceptLogoFiles(files({...file,size:5242881}));expect(state.logoErrorKey).toBe('admin:general.logoErrorTooLarge')
  })
  it('submits the reviewed image, retains the current logo during processing, and adopts completed output',async()=>{
    const{state,api,window,wikiStore,URL}=arrange(),file={name:'logo.png',size:2048};state.acceptLogoFiles(files(file));await state.publishSelected();expect(api.uploadSiteLogo.mock.calls[0]?.[1]).toBe(file);expect(state.activeLogoUrl).toBe('/_site-logo/active/logo.png');expect(window.setTimeout).toHaveBeenCalled();state.applyLogoStatus({active:{revisionId:'next',logoUrl:'/_site-logo/next/logo.png'},candidate:{revisionId:'next',status:'ready',errorCode:null}});expect(wikiStore.site.logoUrl).toBe('/_site-logo/next/logo.png');expect(state.candidatePreviewUrl).toBe('');expect(URL.revokeObjectURL).toHaveBeenCalled()
  })
  it('keeps the active logo after failure and retries through the dedicated pipeline',async()=>{
    const{state,api}=arrange();state.applyLogoStatus({...pending,candidate:{revisionId:'next',status:'failed',errorCode:'UNSUITABLE_LOGO'}});expect(state.candidateHasFailed).toBe(true);expect(state.activeLogoUrl).toBe('/_site-logo/active/logo.png');await state.retryLogo();expect(api.retrySiteLogo).toHaveBeenCalledOnce();expect(state.candidateIsProcessing).toBe(true)
  })
  it('ignores a late response after unmount and releases local preview resources',async()=>{
    const{state,api,component,URL}=arrange();let release:(value:unknown)=>void=()=>{};api.fetchSiteLogoStatus.mockImplementation(()=>new Promise(resolve=>{release=resolve}));state.replaceCandidatePreview({});const pendingRead=state.refreshLogoStatus();component.beforeUnmount.call(state);release(pending);await pendingRead;expect(state.logoStatus).toBeNull();expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:selected')
  })
})
