import { createStyles, makeStyles, Theme } from '@material-ui/core/styles'
import { useEffect, useState, useRef } from 'react'
import ViewerCard from './core/components/ViewerCard'
import { BackgroundConfig } from './core/helpers/backgroundHelper'
import { PostProcessingConfig } from './core/helpers/postProcessingHelper'
import { SegmentationConfig } from './core/helpers/segmentationHelper'
import { SourceConfig, sourceImageUrls } from './core/helpers/sourceHelper'
import useBodyPix from './core/hooks/useBodyPix'
import useTFLite from './core/hooks/useTFLite'
import io from 'socket.io-client'

const pc_config = {
  iceServers: [
    // {
    //   urls: 'stun:[STUN_IP]:[PORT]',
    //   'credentials': '[YOR CREDENTIALS]',
    //   'username': '[USERNAME]'
    // },
    {
      urls: 'stun:stun.l.google.com:19302',
    },
  ],
}
const SOCKET_SERVER_URL = 'http://localhost:8080'
const App = () => {
  //socket////////////////////////////////////
  const socketRef = useRef<SocketIOClient.Socket>()
  const pcRef = useRef<RTCPeerConnection>()
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const remoteVideoRef = useRef<HTMLVideoElement>(null)
  const setVideoTracks = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      })
      if (localVideoRef.current) localVideoRef.current.srcObject = stream
      if (!(pcRef.current && socketRef.current)) return
      stream.getTracks().forEach((track) => {
        if (!pcRef.current) return
        pcRef.current.addTrack(track, stream)
      })
      pcRef.current.onicecandidate = (e) => {
        if (e.candidate) {
          if (!socketRef.current) return
          console.log('onicecandidate')
          socketRef.current.emit('candidate', e.candidate)
        }
      }
      pcRef.current.oniceconnectionstatechange = (e) => {
        console.log(e)
      }
      pcRef.current.ontrack = (ev) => {
        console.log('add remotetrack success')
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = ev.streams[0]
        }
      }
      socketRef.current.emit('join_room', {
        room: '1234',
      })
    } catch (e) {
      console.error(e)
    }
  }
  const createOffer = async () => {
    console.log('create offer')
    if (!(pcRef.current && socketRef.current)) return
    try {
      const sdp = await pcRef.current.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      })
      await pcRef.current.setLocalDescription(new RTCSessionDescription(sdp))
      socketRef.current.emit('offer', sdp)
    } catch (e) {
      console.error(e)
    }
  }
  const createAnswer = async (sdp: RTCSessionDescription) => {
    if (!(pcRef.current && socketRef.current)) return
    try {
      await pcRef.current.setRemoteDescription(new RTCSessionDescription(sdp))
      console.log('answer set remote description success')
      const mySdp = await pcRef.current.createAnswer({
        offerToReceiveVideo: true,
        offerToReceiveAudio: true,
      })
      console.log('create answer')
      await pcRef.current.setLocalDescription(new RTCSessionDescription(mySdp))
      socketRef.current.emit('answer', mySdp)
    } catch (e) {
      console.log('errorrrrrrrrrrrrrrrrrrrrr')
      console.error(e)
    }
  }
  useEffect(() => {
    console.log('useEffect')
    socketRef.current = io.connect(SOCKET_SERVER_URL)
    pcRef.current = new RTCPeerConnection(pc_config)

    socketRef.current.on('all_users', (allUsers: Array<{ id: string }>) => {
      if (allUsers.length > 0) {
        createOffer()
      }
    })

    socketRef.current.on('getOffer', (sdp: RTCSessionDescription) => {
      //console.log(sdp);
      console.log('get offer')
      createAnswer(sdp)
    })

    socketRef.current.on('getAnswer', (sdp: RTCSessionDescription) => {
      console.log('get answer')
      if (!pcRef.current) return
      pcRef.current.setRemoteDescription(new RTCSessionDescription(sdp))
      //console.log(sdp);
    })

    socketRef.current.on(
      'getCandidate',
      async (candidate: RTCIceCandidateInit) => {
        if (!pcRef.current) return
        await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate))
        console.log('candidate add success')
      }
    )

    setVideoTracks()

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect()
      }
      if (pcRef.current) {
        pcRef.current.close()
      }
    }
  }, [])
  //////////////////////////////
  const classes = useStyles()
  const [sourceConfig, setSourceConfig] = useState<SourceConfig>({
    type: 'camera',
    url: sourceImageUrls[0],
  })
  const [sourceConfig2, setSourceConfig2] = useState<SourceConfig>({
    type: 'camera',
    url: sourceImageUrls[0],
  })
  const [backgroundConfig, setBackgroundConfig] = useState<BackgroundConfig>({
    type: 'image',
    url: undefined,
  })
  const [segmentationConfig, setSegmentationConfig] =
    useState<SegmentationConfig>({
      model: 'mlkit',
      backend: 'wasm',
      inputResolution: '256x256',
      pipeline: 'canvas2dCpu',
    })
  const [postProcessingConfig, setPostProcessingConfig] =
    useState<PostProcessingConfig>({
      smoothSegmentationMask: true,
      jointBilateralFilter: { sigmaSpace: 1, sigmaColor: 0.1 },
      coverage: [0.5, 0.75],
      lightWrapping: 0.5,
      blendMode: 'screen',
    })
  const bodyPix = useBodyPix()
  const { tflite, isSIMDSupported } = useTFLite(segmentationConfig)

  useEffect(() => {
    setSegmentationConfig((previousSegmentationConfig) => {
      if (previousSegmentationConfig.backend === 'wasm' && isSIMDSupported) {
        return { ...previousSegmentationConfig, backend: 'wasmSimd' }
      } else {
        return previousSegmentationConfig
      }
    })
  }, [isSIMDSupported])
  return (
    <div className={classes.container}>
      {/* <div className={classes.image}> */}
      <ViewerCard
        sourceConfig={sourceConfig}
        backgroundConfig={backgroundConfig}
        segmentationConfig={segmentationConfig}
        postProcessingConfig={postProcessingConfig}
        bodyPix={bodyPix}
        tflite={tflite}
        ref={localVideoRef}
      />
      <ViewerCard
        sourceConfig={sourceConfig2}
        backgroundConfig={backgroundConfig}
        segmentationConfig={segmentationConfig}
        postProcessingConfig={postProcessingConfig}
        bodyPix={bodyPix}
        tflite={tflite}
        ref={remoteVideoRef}
      />
      {/* </div> */}
    </div>
  )
}

const useStyles = makeStyles((theme: Theme) =>
  createStyles({
    image: {
      float: 'left',
      position: 'relative',
      margin: 0,
    },
    container: {
      justifycontent: 'flex-start',
    },
  })
)

export default App
