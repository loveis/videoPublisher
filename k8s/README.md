# 쿠버네티스 배포 가이드

[docker/README.md](../docker/README.md) 에서 만든 `loveis/mediamtx-manager` 이미지를 쿠버네티스에 올리는 방법입니다.

## 구성
| 파일 | 내용 |
|---|---|
| `namespace.yaml` | `mediamtx` 네임스페이스 |
| `secret.yaml` | 관리 화면 로그인 계정(`ADMIN_USERNAME`, `ADMIN_PASSWORD`) |
| `pvc.yaml` | 설정 1Gi · VOD 20Gi · 녹화 50Gi 볼륨 |
| `deployment.yaml` | 앱 파드 1개 (hostNetwork) |
| `service.yaml` | 클러스터 내부용 ClusterIP |
| `kustomization.yaml` | 위 전체를 한 번에 적용 |

**hostNetwork 를 쓰는 이유** — WebRTC(UDP 8189)와 RTSP(UDP 8000/8001), SRT(UDP 8890)는 포트를 그대로 써야 연결이 안정적입니다.
파드가 노드의 포트를 직접 쓰므로 **노드 한 대에 파드 하나**만 뜹니다(`replicas: 1`, `strategy: Recreate`).

## 1. 준비
1. **이미지 올리기** — 클러스터 노드가 내려받을 수 있는 레지스트리에 push 합니다.
   ```bash
   docker push loveis/mediamtx-manager:1.0.0
   ```
   사설 레지스트리면 `imagePullSecrets` 를 `deployment.yaml` 에 추가하세요.
2. **비밀번호 바꾸기** — `secret.yaml` 의 `change-me` 를 바꾸거나, 배포 후 아래 명령으로 교체합니다.
   ```bash
   kubectl -n mediamtx create secret generic mediamtx-manager-admin \
     --from-literal=ADMIN_USERNAME=admin --from-literal=ADMIN_PASSWORD='원하는비밀번호' \
     --dry-run=client -o yaml | kubectl apply -f -
   kubectl -n mediamtx rollout restart deploy/mediamtx-manager
   ```
3. **스토리지 확인** — 기본 StorageClass 가 없으면 `pvc.yaml` 각 항목에 `storageClassName` 을 적어 주세요.
4. **포트 확인** — 파드가 뜰 노드에서 8080 · 8554 · 1935 · 8888 · 8889 · 9996(TCP)과 8000 · 8001 · 8189 · 8890(UDP)이 비어 있어야 합니다.

## 2. 배포
```bash
kubectl apply -k k8s/

kubectl -n mediamtx get pod,pvc,svc
kubectl -n mediamtx logs -f deploy/mediamtx-manager
```

파드가 `Running` 이 되면 **파드가 뜬 노드의 IP** 로 접속합니다.

```bash
kubectl -n mediamtx get pod -o wide   # NODE, IP 확인
# 관리 화면: http://<노드 IP>:8080
```

시청 URL 의 호스트는 `PUBLIC_HOST` 에 노드 IP(`status.hostIP`)가 자동으로 들어갑니다.
외부에 도메인이나 공인 IP 로 공개한다면 `deployment.yaml` 의 `PUBLIC_HOST` 를 그 주소로 고정하세요.

## 3. 카메라를 쓰려면
노드에 연결된 USB 카메라를 송출하려면 장치를 파드에 넣고 권한을 줘야 합니다.
`deployment.yaml` 의 주석을 풀고 카메라가 달린 노드를 지정하세요.

```yaml
      nodeSelector:
        kubernetes.io/hostname: worker-1   # 카메라가 달린 노드
...
          volumeMounts:
            - { name: video0, mountPath: /dev/video0 }
          securityContext:
            privileged: true
...
      volumes:
        - name: video0
          hostPath: { path: /dev/video0, type: CharDevice }
```

노드에서 `v4l2-ctl --list-devices` 로 장치 번호를 먼저 확인하세요. 카메라가 없으면 카메라 탭만 비고 나머지 기능은 그대로 씁니다.

## 4. 설정 변경
MediaMTX 설정(포트·프로토콜·녹화)은 관리 화면 **설정 탭**에서 바꾸며 `/config/mediamtx.yml`(PVC)에 저장됩니다.
**설정 탭에서 포트를 바꾸면 노드에서 열리는 포트도 함께 바뀝니다.** 방화벽·보안그룹도 같이 수정하세요.

## 5. 업데이트 / 롤백
```bash
# kustomization.yaml 의 newTag 를 바꾸고
kubectl apply -k k8s/
kubectl -n mediamtx rollout status deploy/mediamtx-manager

# 되돌리기
kubectl -n mediamtx rollout undo deploy/mediamtx-manager
```
PVC 는 그대로라 설정·VOD·녹화는 유지됩니다.

## 6. 삭제
```bash
kubectl delete -k k8s/              # PVC 는 남습니다(데이터 보존)
kubectl -n mediamtx delete pvc --all   # 데이터까지 지울 때만
```

## 7. 문제 해결
| 증상 | 원인 / 조치 |
|---|---|
| 파드가 `Pending` | PVC 가 바인딩되지 않음 → `kubectl -n mediamtx describe pvc` 로 StorageClass 확인 |
| 파드가 `CrashLoopBackOff` | 로그에 `bind: address already in use` → 노드에서 해당 포트를 쓰는 프로세스 정리, 또는 설정 탭에서 포트 변경 |
| 관리 화면이 안 열림 | hostNetwork 라 서비스가 아닌 **노드 IP:8080** 으로 접속해야 합니다 |
| 시청 URL 의 IP 가 내부 주소 | 외부 공개 주소를 `PUBLIC_HOST` 에 직접 지정 |
| WebRTC 만 재생 안 됨 | 노드 방화벽에서 8189/udp 허용 확인 |
| 카메라 탭이 비어 있음 | 장치 마운트·`privileged`·`nodeSelector` 설정 확인 |
| 새 파드가 `ContainerCreating` 에서 멈춤 | ReadWriteOnce PVC 를 이전 파드가 잡고 있음 → `Recreate` 전략이라 이전 파드 종료를 기다리면 됩니다 |
